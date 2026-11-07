using System.IO;
using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.JellyRate;

/// <summary>
/// Serves the browser script (embedded Web/jellyrate.js) at /JellyRate/ui.js, the URL <see cref="WebInjector"/> adds to index.html.
/// Anonymous on purpose: a script tag sends no Jellyfin auth header, and the file is the same static code for everyone,
/// with no user data. Everything the script then fetches goes through the authenticated <see cref="RatingController"/>.
/// </summary>
[ApiController]
[AllowAnonymous]
public class UiController : ControllerBase
{
    /// <summary>
    /// Gets the UI script.
    /// </summary>
    /// <response code="200">The script.</response>
    /// <returns>The JavaScript file.</returns>
    [HttpGet("JellyRate/ui.js")]
    [Produces("application/javascript")]
    public ActionResult GetScript()
    {
        var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Jellyfin.Plugin.JellyRate.Web.jellyrate.js");
        if (stream is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = "no-cache"; // Revalidate, so a plugin update takes effect on reload.
        return File(stream, "application/javascript");
    }
}
