using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Xunit;

namespace Jellyfin.Plugin.JellyRate.Tests;

public sealed class RatingStoreTests : IDisposable
{
    private static readonly Guid _item = Guid.NewGuid();
    private static readonly Guid _alice = Guid.NewGuid();
    private static readonly Guid _bob = Guid.NewGuid();
    private readonly string _dir = Directory.CreateTempSubdirectory().FullName;
    private readonly RatingStore _store;

    public RatingStoreTests()
    {
        _store = new RatingStore(Path.Combine(_dir, "jellyrate.json"));
    }

    public void Dispose() => Directory.Delete(_dir, true);

    [Fact]
    public void Set_Creates()
    {
        var r = _store.Set(_item, _alice, 8, "good");
        Assert.Equal(8, r.Score);
        Assert.False(r.Edited);
        Assert.Equal(r.CreatedAt, r.UpdatedAt);
        Assert.Equal(r, Assert.Single(_store.Get(_item)).Rating);
    }

    [Fact]
    public void Set_PersistsAcrossInstances()
    {
        _store.Set(_item, _alice, 8, "good");
        var other = new RatingStore(Path.Combine(_dir, "jellyrate.json"));
        Assert.Equal("good", Assert.Single(other.Get(_item)).Rating.Review);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(11)]
    [InlineData(-1)]
    public void Set_InvalidScore_Throws(int score)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => _store.Set(_item, _alice, score, null));
        Assert.False(File.Exists(Path.Combine(_dir, "jellyrate.json")));
    }

    [Fact]
    public void Set_BlankReviewBecomesNull()
    {
        Assert.Null(_store.Set(_item, _alice, 5, "  ").Review);
    }

    [Fact]
    public void Set_ScoreOnlyChange_IsNotEdited()
    {
        var first = _store.Set(_item, _alice, 5, "good");
        var second = _store.Set(_item, _alice, 9, "good");
        Assert.Equal(9, second.Score);
        Assert.False(second.Edited);
        Assert.Equal(first.CreatedAt, second.CreatedAt);
        Assert.Single(_store.Get(_item));
    }

    [Fact]
    public void Set_ReviewChange_IsEditedAndStaysEdited()
    {
        _store.Set(_item, _alice, 5, "good");
        Assert.True(_store.Set(_item, _alice, 5, "great").Edited);
        Assert.True(_store.Set(_item, _alice, 6, "great").Edited);
    }

    [Fact]
    public void Set_AddingReviewToScoreOnly_IsNotEdited()
    {
        _store.Set(_item, _alice, 5, null);
        Assert.False(_store.Set(_item, _alice, 5, "first review").Edited);
        Assert.False(_store.Set(_item, _alice, 7, "first review").Edited);
    }

    [Fact]
    public void Set_SameReviewAgain_IsNotEdited()
    {
        _store.Set(_item, _alice, 5, "good");
        Assert.False(_store.Set(_item, _alice, 5, "good").Edited);
    }

    [Fact]
    public void Set_ScoreOnlyChangeWithoutReview_IsNotEdited()
    {
        _store.Set(_item, _alice, 5, null);
        Assert.False(_store.Set(_item, _alice, 6, null).Edited);
        Assert.False(_store.Set(_item, _alice, 6, "  ").Edited);
    }

    [Fact]
    public void Set_ClearingReview_IsEdited()
    {
        _store.Set(_item, _alice, 5, "good");
        Assert.True(_store.Set(_item, _alice, 5, null).Edited);
    }

    [Fact]
    public void Set_LongReview_Works()
    {
        var text = new string('x', 100_000);
        Assert.Equal(text, _store.Set(_item, _alice, 5, text).Review);
    }

    [Fact]
    public void Get_NewestFirst()
    {
        _store.Set(_item, _alice, 5, null);
        _store.Set(_item, _bob, 6, null);
        Assert.Equal(new[] { _bob, _alice }, _store.Get(_item).Select(e => e.UserId));
        _store.Set(_item, _alice, 7, null);
        Assert.Equal(new[] { _alice, _bob }, _store.Get(_item).Select(e => e.UserId));
    }

    [Fact]
    public void Get_UnknownItem_IsEmpty()
    {
        Assert.Empty(_store.Get(Guid.NewGuid()));
    }

    [Fact]
    public void Remove_RemovesOnlyThatUser()
    {
        _store.Set(_item, _alice, 5, null);
        _store.Set(_item, _bob, 6, null);
        Assert.True(_store.Remove(_item, _alice));
        Assert.False(_store.Remove(_item, _alice));
        Assert.Equal(_bob, Assert.Single(_store.Get(_item)).UserId);
    }

    [Fact]
    public void Remove_MissingFile_ReturnsFalse()
    {
        Assert.False(_store.Remove(_item, _alice));
    }

    [Fact]
    public void Save_LeavesNoTempFileAndWritesVersion()
    {
        _store.Set(_item, _alice, 5, null);
        var file = Assert.Single(Directory.GetFiles(_dir));
        using var doc = JsonDocument.Parse(File.ReadAllText(file));
        Assert.Equal(1, doc.RootElement.GetProperty("version").GetInt32());
    }

    [Fact]
    public void CorruptFile_Throws_AndIsNotOverwritten()
    {
        var path = Path.Combine(_dir, "jellyrate.json");
        File.WriteAllText(path, "{ not json");
        Assert.ThrowsAny<JsonException>(() => _store.Set(_item, _alice, 5, null));
        Assert.Equal("{ not json", File.ReadAllText(path));
    }

    [Fact]
    public void Concurrent_Sets_AreNotLost()
    {
        var users = Enumerable.Range(0, 30).Select(_ => Guid.NewGuid()).ToList();
        Parallel.ForEach(users, u => _store.Set(_item, u, 5, null));
        Assert.Equal(users.Count, _store.Get(_item).Count);
    }
}
