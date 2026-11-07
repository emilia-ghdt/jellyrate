using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace Jellyfin.Plugin.JellyRate;

/// <summary>
/// Stores ratings in a single JSON file.
/// </summary>
public class RatingStore
{
    private static readonly object _lock = new();
    private static readonly JsonSerializerOptions _options = new() { WriteIndented = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    private readonly string _path;

    /// <summary>
    /// Initializes a new instance of the <see cref="RatingStore"/> class.
    /// </summary>
    /// <param name="path">Path of the JSON file.</param>
    public RatingStore(string path)
    {
        _path = path;
    }

    /// <summary>
    /// Creates or updates a user's rating.
    /// </summary>
    /// <param name="itemId">The item ID.</param>
    /// <param name="userId">The user ID.</param>
    /// <param name="score">The score, 1 to 10.</param>
    /// <param name="review">The optional review text.</param>
    /// <returns>The saved rating.</returns>
    public Rating Set(Guid itemId, Guid userId, int score, string? review)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(score, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(score, 10);
        review = string.IsNullOrWhiteSpace(review) ? null : review;
        lock (_lock)
        {
            var data = Load();
            var users = data.Items.TryGetValue(itemId, out var existing) ? existing : data.Items[itemId] = new();
            var now = DateTimeOffset.UtcNow;
            var rating = users.TryGetValue(userId, out var old)
                ? old with { Score = score, Review = review, UpdatedAt = now, Edited = old.Edited || (old.Review is not null && old.Review != review) }
                : new Rating(score, review, now, now, false);
            users[userId] = rating;
            Save(data);
            return rating;
        }
    }

    /// <summary>
    /// Removes a user's rating.
    /// </summary>
    /// <param name="itemId">The item ID.</param>
    /// <param name="userId">The user ID.</param>
    /// <returns>True if a rating was removed.</returns>
    public bool Remove(Guid itemId, Guid userId)
    {
        lock (_lock)
        {
            var data = Load();
            if (!data.Items.TryGetValue(itemId, out var users) || !users.Remove(userId))
            {
                return false;
            }

            if (users.Count == 0)
            {
                data.Items.Remove(itemId);
            }

            Save(data);
            return true;
        }
    }

    /// <summary>
    /// Gets the ratings of an item, newest first.
    /// </summary>
    /// <param name="itemId">The item ID.</param>
    /// <returns>The ratings with their user IDs.</returns>
    public IReadOnlyList<(Guid UserId, Rating Rating)> Get(Guid itemId)
    {
        lock (_lock)
        {
            return Load().Items.TryGetValue(itemId, out var users)
                ? users.OrderByDescending(u => u.Value.UpdatedAt).Select(u => (u.Key, u.Value)).ToList()
                : [];
        }
    }

    /// <summary>
    /// Gets the average and count of several items with one read. Items without ratings are omitted.
    /// </summary>
    /// <param name="itemIds">The item IDs.</param>
    /// <returns>Summaries by item ID.</returns>
    public Dictionary<Guid, RatingSummary> Summaries(IEnumerable<Guid> itemIds)
    {
        Dictionary<Guid, Dictionary<Guid, Rating>> items;
        lock (_lock)
        {
            items = Load().Items;
        }

        var result = new Dictionary<Guid, RatingSummary>();
        foreach (var id in itemIds)
        {
            if (items.TryGetValue(id, out var users) && users.Count > 0)
            {
                result[id] = new RatingSummary(Math.Round(users.Values.Average(r => r.Score), 2), users.Count);
            }
        }

        return result;
    }

    private Data Load() => File.Exists(_path) ? JsonSerializer.Deserialize<Data>(File.ReadAllText(_path), _options) ?? new() : new();

    private void Save(Data data)
    {
        var tmp = _path + ".tmp";
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(_path))!);
        File.WriteAllText(tmp, JsonSerializer.Serialize(data, _options));
        File.Move(tmp, _path, true);
    }

    private sealed class Data
    {
        public int Version { get; set; } = 1;

        public Dictionary<Guid, Dictionary<Guid, Rating>> Items { get; set; } = new();
    }
}
