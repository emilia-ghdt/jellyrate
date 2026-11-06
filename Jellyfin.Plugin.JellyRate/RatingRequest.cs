namespace Jellyfin.Plugin.JellyRate;

/// <summary>
/// Request body for rating an item.
/// </summary>
/// <param name="Score">The score, 1 to 10.</param>
/// <param name="Review">The optional review text.</param>
public record RatingRequest(int Score, string? Review);
