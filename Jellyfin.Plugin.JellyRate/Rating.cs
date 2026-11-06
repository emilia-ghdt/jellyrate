using System;

namespace Jellyfin.Plugin.JellyRate;

/// <summary>
/// A user's rating of an item.
/// </summary>
/// <param name="Score">The score, 1 to 10.</param>
/// <param name="Review">The optional review text.</param>
/// <param name="CreatedAt">When the rating was first made.</param>
/// <param name="UpdatedAt">When the rating was last changed.</param>
/// <param name="Edited">Whether the review text changed after creation.</param>
public record Rating(int Score, string? Review, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, bool Edited);
