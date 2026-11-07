using System;
using System.Collections.Generic;
using System.Linq;

namespace Jellyfin.Plugin.JellyRate;

/// <summary>
/// The ratings of an item.
/// </summary>
/// <param name="Average">The average score, or null without ratings.</param>
/// <param name="Count">The number of ratings.</param>
/// <param name="Mine">The caller's own entry, if any.</param>
/// <param name="Entries">All entries, newest first.</param>
public record RatingResponse(double? Average, int Count, RatingEntry? Mine, IReadOnlyList<RatingEntry> Entries)
{
    /// <summary>
    /// Builds the response from stored ratings (already newest first).
    /// </summary>
    /// <param name="ratings">The stored ratings.</param>
    /// <param name="getUserName">Resolves a user name, or null if the user no longer exists.</param>
    /// <param name="currentUserId">The caller's user ID.</param>
    /// <returns>The response.</returns>
    public static RatingResponse Create(IReadOnlyList<(Guid UserId, Rating Rating)> ratings, Func<Guid, string?> getUserName, Guid currentUserId)
    {
        var entries = ratings
            .Select(r => new RatingEntry(r.UserId, getUserName(r.UserId) ?? "Unknown user", r.Rating.Score, r.Rating.Review, r.Rating.UpdatedAt, r.Rating.Edited))
            .ToList();
        return new RatingResponse(
            entries.Count == 0 ? null : RatingSummary.RoundedAverage(entries.Select(e => e.Score)),
            entries.Count,
            entries.FirstOrDefault(e => e.UserId == currentUserId),
            entries);
    }
}
