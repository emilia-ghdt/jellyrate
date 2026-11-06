using System;
using System.Linq;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellyRate;

/// <summary>
/// Registers a File Transformation (third-party plugin) that adds our script tag to the web client's index.html.
/// Uses reflection because plugins live in separate load contexts. Does nothing but warn if it is missing.
/// </summary>
public sealed class WebInjector : IHostedService
{
    private const string ScriptTag = "<script src=\"../JellyRate/ui.js\" defer></script>";

    private readonly ILogger<WebInjector> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="WebInjector"/> class.
    /// </summary>
    /// <param name="logger">The logger.</param>
    public WebInjector(ILogger<WebInjector> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Called by File Transformation for index.html.
    /// </summary>
    /// <param name="payload">The file contents.</param>
    /// <returns>The modified contents.</returns>
    public static string Transform(TransformPayload payload)
    {
        var html = payload.Contents ?? string.Empty;
        if (html.Contains("JellyRate/ui.js", StringComparison.Ordinal))
        {
            return html;
        }

        var index = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
        return index < 0 ? html + ScriptTag : html.Insert(index, ScriptTag);
    }

    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            Register();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "JellyRate could not register its web UI with File Transformation; the UI will not appear");
        }

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private void Register()
    {
        var assembly = AssemblyLoadContext.All
            .SelectMany(c => c.Assemblies)
            .FirstOrDefault(a => a.FullName?.Contains(".FileTransformation", StringComparison.Ordinal) ?? false);
        var method = assembly?.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface")?.GetMethod("RegisterTransformation");
        if (method is null)
        {
            _logger.LogWarning("File Transformation plugin not found; the JellyRate web UI will not be shown. Install File Transformation >= 3.0.3.0");
            return;
        }

        var json = JsonSerializer.Serialize(new
        {
            id = "7c52fc58-8da2-4e52-9efc-7c4a2dda690f",
            fileNamePattern = "index\\.html",
            callbackAssembly = typeof(WebInjector).Assembly.FullName,
            callbackClass = typeof(WebInjector).FullName,
            callbackMethod = nameof(Transform)
        });

        // The parameter is a Newtonsoft JObject owned by the other plugin's load context: build it from its own type.
        var paramType = method.GetParameters()[0].ParameterType;
        var parse = paramType.GetMethod("Parse", new[] { typeof(string) });
        var payload = parse is null ? JsonSerializer.Deserialize(json, paramType) : parse.Invoke(null, new object[] { json });
        method.Invoke(null, new[] { payload });
        _logger.LogInformation("JellyRate registered its web UI with File Transformation");
    }
}
