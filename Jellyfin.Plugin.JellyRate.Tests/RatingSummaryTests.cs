using System;
using System.Linq;
using System.IO;
using Xunit;

namespace Jellyfin.Plugin.JellyRate.Tests;

public sealed class RatingSummaryTests : IDisposable
{
    private readonly string _dir = Directory.CreateTempSubdirectory().FullName;

    public void Dispose() => Directory.Delete(_dir, true);

    [Fact]
    public void ParseIds_SkipsInvalidAndDuplicates()
    {
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var ids = RatingSummary.ParseIds($"{a:N}, {b},nope,,{a},{Guid.Empty}");
        Assert.Equal(new[] { a, b }, ids);
        Assert.Empty(RatingSummary.ParseIds(null));
    }

    [Fact]
    public void ParseIds_DoesNotTruncate_SoCallerCanReject()
    {
        var raw = string.Join(',', Enumerable.Range(0, RatingSummary.MaxIds + 1).Select(_ => Guid.NewGuid()));
        Assert.Equal(RatingSummary.MaxIds + 1, RatingSummary.ParseIds(raw).Count);
    }

    [Fact]
    public void Summaries_AveragesAndOmitsUnrated()
    {
        var store = new RatingStore(Path.Combine(_dir, "jellyrate.json"));
        var rated = Guid.NewGuid();
        var unrated = Guid.NewGuid();
        store.Set(rated, Guid.NewGuid(), 7, null);
        store.Set(rated, Guid.NewGuid(), 8, null);
        store.Set(rated, Guid.NewGuid(), 8, null);
        var s = store.Summaries([rated, unrated]);
        Assert.Equal(new RatingSummary(7.67, 3), Assert.Single(s).Value);
        Assert.Empty(store.Summaries([]));
    }
}
