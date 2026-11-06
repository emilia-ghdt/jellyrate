using System;
using System.Collections.Generic;
using Xunit;

namespace Jellyfin.Plugin.JellyRate.Tests;

public class RatingResponseTests
{
    private static readonly Guid _alice = Guid.NewGuid();
    private static readonly Guid _bob = Guid.NewGuid();
    private static readonly Guid _gone = Guid.NewGuid();
    private static readonly DateTimeOffset _now = DateTimeOffset.UtcNow;

    private static string? Name(Guid id) => id == _alice ? "alice" : id == _bob ? "bob" : null;

    [Fact]
    public void Create_Empty()
    {
        var r = RatingResponse.Create([], Name, _alice);
        Assert.Null(r.Average);
        Assert.Equal(0, r.Count);
        Assert.Null(r.Mine);
        Assert.Empty(r.Entries);
    }

    [Fact]
    public void Create_ShapesResponse()
    {
        var ratings = new List<(Guid, Rating)>
        {
            (_bob, new Rating(7, null, _now, _now, false)),
            (_alice, new Rating(8, "good", _now, _now, true)),
            (_gone, new Rating(8, null, _now, _now, false)),
        };
        var r = RatingResponse.Create(ratings, Name, _alice);
        Assert.Equal(7.67, r.Average);
        Assert.Equal(3, r.Count);
        Assert.Equal("bob", r.Entries[0].UserName);
        Assert.Equal("Unknown user", r.Entries[2].UserName);
        Assert.Equal(new RatingEntry(_alice, "alice", 8, "good", _now, true), r.Mine);
    }
}
