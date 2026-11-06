using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Xunit;

namespace Jellyfin.Plugin.JellyRate.IntegrationTests;

public record Entry(Guid UserId, string UserName, int Score, string? Review, DateTime UpdatedAt, bool Edited);

public record Ratings(double? Average, int Count, Entry? Mine, List<Entry> Entries);

/// <summary>Jellyfin writes GUIDs without dashes ("N" format), which System.Text.Json refuses to read.</summary>
public sealed class LenientGuidConverter : System.Text.Json.Serialization.JsonConverter<Guid>
{
    public override Guid Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) => Guid.Parse(reader.GetString()!);

    public override void Write(Utf8JsonWriter writer, Guid value, JsonSerializerOptions options) => writer.WriteStringValue(value);
}

/// <summary>
/// Runs the startup wizard on a fresh server, creates users and media, and offers authenticated clients.
/// Expects media in $JELLYFIN_MEDIA/movies and /shows (see integration/run.sh).
/// </summary>
public sealed class JellyfinFixture : IAsyncLifetime
{
    public const string Password = "pw-12345";

    // Jellyfin serializes PascalCase; read case-insensitively.
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new LenientGuidConverter() } };

    public static readonly string Media = Environment.GetEnvironmentVariable("JELLYFIN_MEDIA") ?? "/media";

    public Uri BaseUrl { get; } = new(Environment.GetEnvironmentVariable("JELLYFIN_URL") ?? "http://localhost:8096");

    public HttpClient Anonymous { get; private set; } = null!;

    public HttpClient Alice { get; private set; } = null!;

    public HttpClient Bob { get; private set; } = null!;

    public HttpClient Restricted { get; private set; } = null!;

    public Guid AliceId { get; private set; }

    public Guid BobId { get; private set; }

    public Guid MovieId { get; private set; }

    public Guid SeriesId { get; private set; }

    public Guid EpisodeId { get; private set; }

    public async Task InitializeAsync()
    {
        Anonymous = NewClient(null);
        await WaitForServerAsync();

        // Startup wizard.
        await OkAsync(await Anonymous.PostAsJsonAsync("Startup/Configuration", new { UICulture = "en-US", MetadataCountryCode = "US", PreferredMetadataLanguage = "en" }));
        await OkAsync(await Anonymous.GetAsync("Startup/User")); // creates the initial user
        await OkAsync(await Anonymous.PostAsJsonAsync("Startup/User", new { Name = "admin", Password }));
        await OkAsync(await Anonymous.PostAsync("Startup/Complete", null));

        var (admin, _) = await LoginAsync("admin");
        await CreateLibraryAsync(admin, "Movies", "movies", Path.Combine(Media, "movies"));
        await CreateLibraryAsync(admin, "Shows", "tvshows", Path.Combine(Media, "shows"));

        AliceId = await CreateUserAsync(admin, "alice");
        BobId = await CreateUserAsync(admin, "bob");
        var restrictedId = await CreateUserAsync(admin, "restricted");
        await OkAsync(await admin.PostAsync("Library/Refresh", null));
        (Alice, _) = await LoginAsync("alice");
        (Bob, _) = await LoginAsync("bob");
        (Restricted, _) = await LoginAsync("restricted");

        // No library access for "restricted".
        var user = await GetJsonAsync(admin, $"Users/{restrictedId:N}");
        var policy = user["Policy"]!.AsObject();
        policy["EnableAllFolders"] = false;
        policy["EnabledFolders"] = new JsonArray();
        await OkAsync(await admin.PostAsJsonAsync($"Users/{restrictedId:N}/Policy", policy));

        MovieId = await WaitForItemAsync(admin, "Movie");
        SeriesId = await WaitForItemAsync(admin, "Series");
        EpisodeId = await WaitForItemAsync(admin, "Episode");
    }

    public Task DisposeAsync() => Task.CompletedTask;

    public async Task<Ratings> ReadAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<Ratings>(Json))!;
    }

    private static async Task OkAsync(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{response.RequestMessage?.RequestUri}: {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
    }

    private static async Task<JsonNode> GetJsonAsync(HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        await OkAsync(response);
        return (await response.Content.ReadFromJsonAsync<JsonNode>())!;
    }

    private static string AuthHeader(string? token) =>
        "MediaBrowser Client=\"JellyRateTests\", Device=\"ci\", DeviceId=\"jellyrate-tests\", Version=\"1.0\"" + (token is null ? string.Empty : $", Token=\"{token}\"");

    private HttpClient NewClient(string? token)
    {
        var client = new HttpClient { BaseAddress = BaseUrl };
        client.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", AuthHeader(token));
        return client;
    }

    private async Task WaitForServerAsync()
    {
        for (var i = 0; i < 120; i++)
        {
            try
            {
                if ((await Anonymous.GetAsync("System/Info/Public")).IsSuccessStatusCode)
                {
                    return;
                }
            }
            catch (HttpRequestException)
            {
            }

            await Task.Delay(1000);
        }

        throw new TimeoutException("Jellyfin did not start.");
    }

    private async Task<(HttpClient Client, Guid UserId)> LoginAsync(string name)
    {
        var response = await Anonymous.PostAsJsonAsync("Users/AuthenticateByName", new { Username = name, Pw = Password });
        await OkAsync(response);
        var node = (await response.Content.ReadFromJsonAsync<JsonNode>())!;
        return (NewClient(node["AccessToken"]!.GetValue<string>()), Guid.Parse(node["User"]!["Id"]!.GetValue<string>()));
    }

    private static async Task<Guid> CreateUserAsync(HttpClient admin, string name)
    {
        var response = await admin.PostAsJsonAsync("Users/New", new { Name = name, Password });
        await OkAsync(response);
        return Guid.Parse((await response.Content.ReadFromJsonAsync<JsonNode>())!["Id"]!.GetValue<string>());
    }

    private static async Task CreateLibraryAsync(HttpClient admin, string name, string type, string path) =>
        await OkAsync(await admin.PostAsJsonAsync($"Library/VirtualFolders?name={name}&collectionType={type}&paths={Uri.EscapeDataString(path)}&refreshLibrary=false", new { }));

    private static async Task<Guid> WaitForItemAsync(HttpClient admin, string type)
    {
        for (var i = 0; i < 90; i++)
        {
            var items = (await GetJsonAsync(admin, $"Items?Recursive=true&IncludeItemTypes={type}"))["Items"]!.AsArray();
            if (items.Count > 0)
            {
                return Guid.Parse(items[0]!["Id"]!.GetValue<string>());
            }

            await Task.Delay(1000);
        }

        throw new TimeoutException($"No {type} appeared in the library.");
    }
}
