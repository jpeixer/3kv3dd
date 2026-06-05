using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using GLTFast;
using GLTFast.Export;
using UnityEditor;
using UnityEngine;
using UnityEngine.SceneManagement;

/// <summary>
/// Exporta a cena ativa para docs/ (GLB) para GitHub Pages.
/// Menu: 3kv3dd → Export for Web
/// </summary>
public static class WebExportMenu
{
    const string DocsFolder = "docs";
    const string GlbPath = "docs/assets/scene.glb";
    const string ConfigPath = "docs/data/viewer-config.json";
    const string DefaultEmbedUrl = "https://jpeixer.github.io/3kv/";

    static readonly HashSet<string> SkipRootNames = new HashSet<string>
    {
        "Main Camera",
        "Directional Light",
        "Global Volume",
    };

    [MenuItem("3kv3dd/Export for Web")]
    public static void ExportForWebMenu()
    {
        _ = ExportForWebAsync();
    }

    static async Task ExportForWebAsync()
    {
        var roots = FindExportRoots();
        if (roots.Length == 0)
        {
            EditorUtility.DisplayDialog("3kv3dd", "Nenhum objeto exportável na cena ativa.", "OK");
            return;
        }

        EnsureDirectories();

        try
        {
            EditorUtility.DisplayProgressBar("3kv3dd", "Exportando GLB…", 0.3f);
            await ExportGlbAsync(roots);

            EditorUtility.DisplayProgressBar("3kv3dd", "Gerando viewer-config.json…", 0.75f);
            WriteViewerConfig(roots);

            AssetDatabase.Refresh();
            var fullPath = Path.GetFullPath(GlbPath);
            var sizeMb = new FileInfo(fullPath).Length / (1024f * 1024f);
            Debug.Log($"[3kv3dd] Export concluído:\n {GlbPath} ({sizeMb:F1} MB)\n {ConfigPath}");
            EditorUtility.DisplayDialog("3kv3dd", $"Export concluído.\n{GlbPath}\n{sizeMb:F1} MB", "OK");
        }
        catch (Exception ex)
        {
            Debug.LogError($"[3kv3dd] Export falhou: {ex}");
            EditorUtility.DisplayDialog("3kv3dd", $"Export falhou:\n{ex.Message}", "OK");
        }
        finally
        {
            EditorUtility.ClearProgressBar();
        }
    }

    static GameObject[] FindExportRoots()
    {
        var scene = SceneManager.GetActiveScene();
        var roots = scene.GetRootGameObjects();
        var list = new List<GameObject>();
        foreach (var root in roots)
        {
            if (SkipRootNames.Contains(root.name))
                continue;
            list.Add(root);
        }
        return list.ToArray();
    }

    static void EnsureDirectories()
    {
        Directory.CreateDirectory(Path.Combine(DocsFolder, "assets"));
        Directory.CreateDirectory(Path.Combine(DocsFolder, "data"));
    }

    static async Task ExportGlbAsync(GameObject[] roots)
    {
        var fullPath = Path.GetFullPath(GlbPath);
        var exportSettings = new ExportSettings
        {
            Format = GltfFormat.Binary,
            FileConflictResolution = FileConflictResolution.Overwrite,
            Compression = Compression.MeshOpt,
            JpgQuality = 45,
            ComponentMask = ~(ComponentType.Camera | ComponentType.Animation),
        };

        var goSettings = new GameObjectExportSettings
        {
            OnlyActiveInHierarchy = true,
            DisabledComponents = false,
        };

        var export = new GameObjectExport(exportSettings, goSettings);
        if (!export.AddScene(roots, "SampleScene"))
            throw new InvalidOperationException("Falha ao adicionar cena ao export GLB.");

        var success = await export.SaveToFileAndDispose(fullPath);
        if (!success)
            throw new InvalidOperationException("SaveToFileAndDispose retornou false.");
    }

    static void WriteViewerConfig(GameObject[] roots)
    {
        string embedUrl = DefaultEmbedUrl;
        string nodeName = "Plane";
        string title = "Withstand Voltage Test — Secondary Windings";

        foreach (var root in roots)
        {
            var screens = root.GetComponentsInChildren<DisplayScreen>(true);
            if (screens.Length == 0) continue;
            var screen = screens[0];
            if (!string.IsNullOrWhiteSpace(screen.embedUrl)) embedUrl = screen.embedUrl.Trim();
            if (!string.IsNullOrWhiteSpace(screen.nodeName)) nodeName = screen.nodeName.Trim();
            break;
        }

        var plane = GameObject.Find(nodeName);
        if (plane != null)
        {
            var onPlane = plane.GetComponent<DisplayScreen>();
            if (onPlane != null)
            {
                if (!string.IsNullOrWhiteSpace(onPlane.embedUrl)) embedUrl = onPlane.embedUrl.Trim();
                if (!string.IsNullOrWhiteSpace(onPlane.nodeName)) nodeName = onPlane.nodeName.Trim();
            }
        }

        var json = new StringBuilder();
        json.AppendLine("{");
        json.AppendLine("  \"version\": 1,");
        json.AppendLine("  \"modelPath\": \"./assets/scene.glb\",");
        json.AppendLine("  \"backgroundColor\": \"#0f1117\",");
        json.AppendLine("  \"display\": {");
        json.AppendLine($"    \"nodeName\": {JsonStr(nodeName)},");
        json.AppendLine($"    \"embedUrl\": {JsonStr(embedUrl)},");
        json.AppendLine($"    \"title\": {JsonStr(title)},");
        json.AppendLine("    \"pixelWidth\": 1280,");
        json.AppendLine("    \"pixelHeight\": 800");
        json.AppendLine("  },");
        json.AppendLine("  \"camera\": {");
        json.AppendLine("    \"fov\": 45,");
        json.AppendLine("    \"minDistance\": 0.8,");
        json.AppendLine("    \"maxDistance\": 80,");
        json.AppendLine("    \"target\": [0, 8, 0]");
        json.AppendLine("  },");
        json.AppendLine("  \"lights\": {");
        json.AppendLine("    \"ambientIntensity\": 0.55,");
        json.AppendLine("    \"directionalIntensity\": 1.1,");
        json.AppendLine("    \"directionalPosition\": [10, 20, 12]");
        json.AppendLine("  }");
        json.AppendLine("}");

        File.WriteAllText(ConfigPath, json.ToString(), Encoding.UTF8);
    }

    static string JsonStr(string value)
    {
        if (string.IsNullOrEmpty(value)) return "\"\"";
        return "\"" + value
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\n", "\\n")
            .Replace("\r", "") + "\"";
    }
}
