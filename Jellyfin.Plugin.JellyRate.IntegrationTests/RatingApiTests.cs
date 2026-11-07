using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace Jellyfin.Plugin.JellyRate.IntegrationTests;

public class RatingApiTests : IClassFixture<JellyfinFixture>
{
    private readonly JellyfinFixture _f;

    public RatingApiTests(JellyfinFixture fixture)
    {
        _f = fixture;
    }

    private string Url(Guid id) => $"JellyRate/Items/{id}";

    private static Task<HttpResponseMessage> Put(HttpClient c, string url, int score, string? review = null) =>
        c.PutAsJsonAsync(url, new { Score = score, Review = review });

    private string SummariesUrl(params Guid[] ids) => "JellyRate/Summaries?ids=" + string.Join(',', ids.Select(i => i.ToString("N")));

    private record Summary(double Average, int Count);

    private static async Task<Dictionary<string, Summary>> ReadSummaries(HttpResponseMessage r)
    {
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return (await r.Content.ReadFromJsonAsync<Dictionary<string, Summary>>(JellyfinFixture.Json))!;
    }

    [Fact]
    public async Task Summaries_ReturnsOnlyRatedItems()
    {
        await CleanAsync();
        await Put(_f.Alice, Url(_f.MovieId), 8);
        await Put(_f.Bob, Url(_f.MovieId), 5);

        var s = await ReadSummaries(await _f.Alice.GetAsync(SummariesUrl(_f.MovieId, _f.SeriesId, _f.EpisodeId, Guid.NewGuid()) + ",junk"));
        var entry = Assert.Single(s);
        Assert.Equal(_f.MovieId.ToString("N"), entry.Key);
        Assert.Equal(6.5, entry.Value.Average);
        Assert.Equal(2, entry.Value.Count);
    }

    [Fact]
    public async Task Summaries_HiddenItemsAreOmitted()
    {
        await CleanAsync();
        await Put(_f.Alice, Url(_f.MovieId), 8);
        Assert.Empty(await ReadSummaries(await _f.Restricted.GetAsync(SummariesUrl(_f.MovieId))));
    }

    [Fact]
    public async Task Summaries_RequiresAuthAndCapsIds()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _f.Anonymous.GetAsync(SummariesUrl(_f.MovieId))).StatusCode);
        var many = Enumerable.Range(0, 100 + 1).Select(_ => Guid.NewGuid()).ToArray();
        Assert.Equal(HttpStatusCode.BadRequest, (await _f.Alice.GetAsync(SummariesUrl(many))).StatusCode);
        Assert.Empty(await ReadSummaries(await _f.Alice.GetAsync(SummariesUrl(many.Take(100).ToArray()))));
    }

    private async Task CleanAsync()
    {
        foreach (var id in new[] { _f.MovieId, _f.SeriesId })
        {
            await _f.Alice.DeleteAsync(Url(id));
            await _f.Bob.DeleteAsync(Url(id));
        }
    }

    [Fact]
    public async Task RequiresAuthentication()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _f.Anonymous.GetAsync(Url(_f.MovieId))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Put(_f.Anonymous, Url(_f.MovieId), 5)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _f.Anonymous.DeleteAsync(Url(_f.MovieId))).StatusCode);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(11)]
    [InlineData(-3)]
    public async Task RejectsInvalidScore(int score)
    {
        await CleanAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await Put(_f.Alice, Url(_f.MovieId), score)).StatusCode);
        Assert.Equal(0, (await _f.ReadAsync(await _f.Alice.GetAsync(Url(_f.MovieId)))).Count);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(10)]
    public async Task AcceptsBoundaryScores(int score)
    {
        await CleanAsync();
        var r = await _f.ReadAsync(await Put(_f.Alice, Url(_f.MovieId), score));
        Assert.Equal(score, r.Mine!.Score);
    }

    [Fact]
    public async Task EditingReviewSetsEdited()
    {
        await CleanAsync();
        var first = await _f.ReadAsync(await Put(_f.Alice, Url(_f.MovieId), 7, "good"));
        Assert.False(first.Mine!.Edited);

        var second = await _f.ReadAsync(await Put(_f.Alice, Url(_f.MovieId), 9, "great"));
        Assert.Equal(1, second.Count);
        Assert.Equal(9, second.Mine!.Score);
        Assert.Equal("great", second.Mine.Review);
        Assert.True(second.Mine.Edited);
    }

    [Fact]
    public async Task OnlyChangingExistingReviewSetsEdited()
    {
        await CleanAsync();
        var u = Url(_f.MovieId);
        Assert.False((await _f.ReadAsync(await Put(_f.Alice, u, 6))).Mine!.Edited);
        Assert.False((await _f.ReadAsync(await Put(_f.Alice, u, 6, "first review"))).Mine!.Edited);
        Assert.False((await _f.ReadAsync(await Put(_f.Alice, u, 8, "first review"))).Mine!.Edited);
        Assert.False((await _f.ReadAsync(await Put(_f.Alice, u, 8, "first review"))).Mine!.Edited);
        Assert.True((await _f.ReadAsync(await Put(_f.Alice, u, 8, "changed review"))).Mine!.Edited);
    }

    [Fact]
    public async Task RemoveDeletesOwnRatingOnly()
    {
        await CleanAsync();
        await Put(_f.Alice, Url(_f.MovieId), 8);
        await Put(_f.Bob, Url(_f.MovieId), 4);

        var after = await _f.ReadAsync(await _f.Alice.DeleteAsync(Url(_f.MovieId)));
        Assert.Null(after.Mine);
        Assert.Equal(1, after.Count);
        Assert.Equal("bob", after.Entries[0].UserName);
    }

    [Fact]
    public async Task ShowsOtherUsersWithAverageNewestFirst()
    {
        await CleanAsync();
        await Put(_f.Alice, Url(_f.MovieId), 8, "alice says");
        await Task.Delay(100);
        await Put(_f.Bob, Url(_f.MovieId), 4, "bob says");

        var r = await _f.ReadAsync(await _f.Alice.GetAsync(Url(_f.MovieId)));
        Assert.Equal(2, r.Count);
        Assert.Equal(6, r.Average);
        Assert.Equal(new[] { "bob", "alice" }, r.Entries.Select(e => e.UserName).ToArray());
        Assert.Equal(new[] { 4, 8 }, r.Entries.Select(e => e.Score).ToArray());
        Assert.Equal(_f.AliceId, r.Mine!.UserId);
        Assert.Equal("bob says", r.Entries[0].Review);
    }

    [Fact]
    public async Task SeriesCanBeRated()
    {
        await CleanAsync();
        var r = await _f.ReadAsync(await Put(_f.Bob, Url(_f.SeriesId), 6));
        Assert.Equal(6, r.Average);
    }

    [Fact]
    public async Task NonMovieOrSeriesAndUnknownItemsAre404()
    {
        foreach (var id in new[] { _f.EpisodeId, Guid.NewGuid() })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await _f.Alice.GetAsync(Url(id))).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await Put(_f.Alice, Url(id), 5)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await _f.Alice.DeleteAsync(Url(id))).StatusCode);
        }
    }

    [Fact]
    public async Task UserWithoutLibraryAccessGets404()
    {
        await CleanAsync();
        await Put(_f.Alice, Url(_f.MovieId), 8);

        Assert.Equal(HttpStatusCode.NotFound, (await _f.Restricted.GetAsync(Url(_f.MovieId))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Put(_f.Restricted, Url(_f.MovieId), 1)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _f.Restricted.DeleteAsync(Url(_f.MovieId))).StatusCode);
        Assert.Equal(1, (await _f.ReadAsync(await _f.Alice.GetAsync(Url(_f.MovieId)))).Count);
    }
}
