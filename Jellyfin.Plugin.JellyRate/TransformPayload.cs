using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyRate;

/// <summary>
/// The payload File Transformation passes to <see cref="WebInjector.Transform"/>: the served index.html.
/// </summary>
public class TransformPayload
{
    /// <summary>
    /// Gets or sets the file contents.
    /// </summary>
    [JsonPropertyName("contents")]
    public string? Contents { get; set; }
}
