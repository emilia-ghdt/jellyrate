using System;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Net.Mime;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.JellyRate;

/// <summary>
/// The rating API.
/// </summary>
[ApiController]
[Authorize]
[Route("JellyRate/Items/{itemId}")]
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
    [HttpGet]
    public ActionResult<RatingResponse> Get([FromRoute] Guid itemId)
    {
        return Check(itemId, out var userId) is { } error ? error : Respond(itemId, userId);
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
    [HttpPut]
    public ActionResult<RatingResponse> Put([FromRoute] Guid itemId, [FromBody, Required] RatingRequest request)
    {
        if (Check(itemId, out var userId) is { } error)
        {
            return error;
        }

        if (request.Score is < 1 or > 10)
        {
            return BadRequest("Score must be between 1 and 10.");
        }

        _store.Set(itemId, userId, request.Score, request.Review);
        return Respond(itemId, userId);
    }

    /// <summary>
    /// Removes the caller's rating.
    /// </summary>
    /// <param name="itemId">The item ID.</param>
    /// <response code="200">The updated ratings.</response>
    /// <response code="404">The item is unknown, not a movie or series, or not visible to the user.</response>
    /// <returns>The ratings.</returns>
    [HttpDelete]
    public ActionResult<RatingResponse> Delete([FromRoute] Guid itemId)
    {
        if (Check(itemId, out var userId) is { } error)
        {
            return error;
        }

        _store.Remove(itemId, userId);
        return Respond(itemId, userId);
    }

    // Returns an error result, or null when the caller may access the item.
    private NotFoundResult? Check(Guid itemId, out Guid userId)
    {
        // Claim set by Jellyfin's authentication handler.
        var claim = User.Claims.FirstOrDefault(c => c.Type == "Jellyfin-UserId")?.Value;
        userId = Guid.TryParse(claim, out var id) ? id : Guid.Empty;
        var user = userId == Guid.Empty ? null : _userManager.GetUserById(userId);
        var item = user is null ? null : _libraryManager.GetItemById<BaseItem>(itemId, user);
        return item is Movie or Series ? null : NotFound();
    }

    private RatingResponse Respond(Guid itemId, Guid userId)
    {
        return RatingResponse.Create(_store.Get(itemId), id => _userManager.GetUserById(id)?.Username, userId);
    }
}
