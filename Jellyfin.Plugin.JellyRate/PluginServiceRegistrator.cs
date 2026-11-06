using System.IO;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Jellyfin.Plugin.JellyRate;

/// <summary>
/// Registers the plugin's services.
/// </summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    /// <inheritdoc />
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        serviceCollection.AddHostedService<WebInjector>();
        // Resolved lazily, because the plugin instance may not exist yet at registration time.
        serviceCollection.AddSingleton(_ => new RatingStore(Path.Combine(Plugin.Instance!.DataFolderPath, "jellyrate.json")));
    }
}
