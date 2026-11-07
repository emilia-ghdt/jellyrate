using System;
using System.Collections.Generic;
using System.Linq;

namespace Jellyfin.Plugin.JellyRate;

/// <summary>
/// The average and count of an item's ratings.
/// </summary>
/// <param name="Average">The average score.</param>
/// <param name="Count">The number of ratings.</param>
public record RatingSummary(double Average, int Count)
{
    /// <summary>
    /// The maximum number of IDs per bulk request.
    /// </summary>
    public const int MaxIds = 100;

    /// <summary>
    /// Parses a comma-separated ID list. Invalid entries are skipped and duplicates removed.
    /// </summary>
    /// <param name="ids">The raw query value.</param>
    /// <returns>The distinct IDs.</returns>
    public static IReadOnlyList<Guid> ParseIds(string? ids)
    {
        return (ids ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => Guid.TryParse(s, out var g) ? g : Guid.Empty)
            .Where(g => g != Guid.Empty)
            .Distinct()
            .ToList();
    }
}
