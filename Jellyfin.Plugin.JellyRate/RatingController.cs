using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Net.Mime;
using Jellyfin.Database.Implementations.Entities;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.JellyRate;

/// <summary>
/// The rating API (/JellyRate/Items/{id} and /JellyRate/Summaries). Runs on the server, logged-in users only.
/// The user is always taken from Jellyfin's auth claims, never from the request, and only movies and series
/// the caller can see are served (404 otherwise). Reads and writes go through <see cref="RatingStore"/>.
/// </summary>
[ApiController]
[Authorize] // Jellyfin's default policy: any authenticated user.
[Route("JellyRate")]
[Produces(MediaTypeNames.Application.Json)]
public class RatingController : ControllerBase
{
    private readonly RatingStore _store;
    private readonly IUserManager _userManager;
    private readonly ILibraryManager _libraryManager;

    /// <summary>
    /// Initializes a new instance of the <see cref="RatingController"/> class.
    /// </summary>
    /// <param name="store">The rating store.</param>
    /// <param name="userManager">Instance of the <see cref="IUserManager"/> interface.</param>
    /// <param name="libraryManager">Instance of the <see cref="ILibraryManager"/> interface.</param>
    public RatingController(RatingStore store, IUserManager userManager, ILibraryManager libraryManager)
    {
        _store = store;
        _userManager = userManager;
        _libraryManager = libraryManager;
    }

    /// <summary>
    /// Gets the ratings of an item.
    /// </summary>
    /// <param name="itemId">The item ID.</param>
    /// <response code="200">The item's ratings.</response>
    /// <response code="404">The item is unknown, not a movie or series, or not visible to the user.</response>
    /// <returns>The ratings.</returns>
    [HttpGet("Items/{itemId}")]
    public ActionResult<RatingResponse> Get([FromRoute] Guid itemId)
    {
        return CallerWhoCanSee(itemId) is { } user ? Respond(itemId, user.Id) : NotFound();
    }

    /// <summary>
    /// Creates or updates the caller's rating.
    /// </summary>
    /// <param name="itemId">The item ID.</param>
    /// <param name="request">The rating.</param>
    /// <response code="200">The updated ratings.</response>
    /// <response code="400">The score is not between 1 and 10.</response>
    /// <response code="404">The item is unknown, not a movie or series, or not visible to the user.</response>
    /// <returns>The ratings.</returns>
    [HttpPut("Items/{itemId}")]
    public ActionResult<RatingResponse> Put([FromRoute] Guid itemId, [FromBody, Required] RatingRequest request)
    {
        if (CallerWhoCanSee(itemId) is not { } user)
        {
            return NotFound();
        }

        if (request.Score is < 1 or > 10)
        {
            return BadRequest("Score must be between 1 and 10.");
        }

        _store.Set(itemId, user.Id, request.Score, request.Review);
        return Respond(itemId, user.Id);
    }

    /// <summary>
    /// Removes the caller's rating.
    /// </summary>
    /// <param name="itemId">The item ID.</param>
    /// <response code="200">The updated ratings.</response>
    /// <response code="404">The item is unknown, not a movie or series, or not visible to the user.</response>
    /// <returns>The ratings.</returns>
    [HttpDelete("Items/{itemId}")]
    public ActionResult<RatingResponse> Delete([FromRoute] Guid itemId)
    {
        if (CallerWhoCanSee(itemId) is not { } user)
        {
            return NotFound();
        }

        _store.Remove(itemId, user.Id);
        return Respond(itemId, user.Id);
    }

    /// <summary>
    /// Gets the average and count for several items at once (for title cards).
    /// </summary>
    /// <param name="ids">Comma-separated item IDs, at most <see cref="RatingSummary.MaxIds"/>.</param>
    /// <response code="200">Summaries by item ID; only visible movies and series that have ratings.</response>
    /// <response code="400">Too many IDs.</response>
    /// <returns>The summaries.</returns>
    [HttpGet("Summaries")]
    public ActionResult<IReadOnlyDictionary<string, RatingSummary>> Summaries([FromQuery] string? ids)
    {
        var wanted = RatingSummary.ParseIds(ids);
        if (wanted.Count > RatingSummary.MaxIds)
        {
            return BadRequest($"At most {RatingSummary.MaxIds} ids.");
        }

        if (Caller() is not { } user)
        {
            return NotFound();
        }

        // Hidden items are silently omitted, so a caller can't tell them apart from unrated ones.
        var visible = wanted.Where(id => CanSee(user, id));
        return Ok(_store.Summaries(visible).ToDictionary(kv => kv.Key.ToString("N"), kv => kv.Value));
    }

    // The authenticated user, from the claim set by Jellyfin's authentication handler.
    private User? Caller()
    {
        var claim = User.Claims.FirstOrDefault(c => c.Type == "Jellyfin-UserId")?.Value;
        return Guid.TryParse(claim, out var id) && id != Guid.Empty ? _userManager.GetUserById(id) : null;
    }

    // Library-access check: GetItemById with a user returns null when that user's library access or
    // parental rules hide the item.
    private bool CanSee(User user, Guid itemId) => _libraryManager.GetItemById<BaseItem>(itemId, user) is Movie or Series;

    private User? CallerWhoCanSee(Guid itemId) => Caller() is { } user && CanSee(user, itemId) ? user : null;

    private RatingResponse Respond(Guid itemId, Guid userId)
    {
        return RatingResponse.Create(_store.Get(itemId), id => _userManager.GetUserById(id)?.Username, userId);
    }
}
