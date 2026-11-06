using System;

namespace Jellyfin.Plugin.JellyRate;

/// <summary>
/// One user's rating in a response.
/// </summary>
/// <param name="UserId">The user ID.</param>
/// <param name="UserName">The user name.</param>
/// <param name="Score">The score, 1 to 10.</param>
/// <param name="Review">The review text.</param>
/// <param name="UpdatedAt">When the rating was last changed.</param>
/// <param name="Edited">Whether the review text was edited.</param>
public record RatingEntry(Guid UserId, string UserName, int Score, string? Review, DateTimeOffset UpdatedAt, bool Edited);
