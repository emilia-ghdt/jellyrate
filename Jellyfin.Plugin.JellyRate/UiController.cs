using System.IO;
using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.JellyRate;

/// <summary>
/// Serves the static UI script. Anonymous on purpose: the script is the same for everyone and contains no data.
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

        Response.Headers.CacheControl = "no-cache";
        return File(stream, "application/javascript");
    }
}
