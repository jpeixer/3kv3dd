using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using GLTFast;
using GLTFast.Export;
using UnityEditor;
using UnityEditor.SceneManagement;
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
    const string SampleScenePath = "Assets/Scenes/SampleScene.unity";
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

    public static void RunExportSync()
    {
        ExportForWebAsync().GetAwaiter().GetResult();
    }

    /// <summary>Entrada para CI / terminal: Unity -batchmode -executeMethod WebExportMenu.ExportForWebBatch</summary>
    public static void ExportForWebBatch()
    {
        try
        {
            if (!File.Exists(SampleScenePath))
                throw new FileNotFoundException("Cena nao encontrada", SampleScenePath);

            EditorSceneManager.OpenScene(SampleScenePath, OpenSceneMode.Single);
            RunExportSync();
            Debug.Log("[3kv3dd] Batch export concluido.");
            EditorApplication.Exit(0);
        }
        catch (Exception ex)
        {
            Debug.LogError($"[3kv3dd] Batch export falhou: {ex}");
            EditorApplication.Exit(1);
        }
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
        var tempPath = fullPath + ".tmp";

        if (File.Exists(tempPath))
            File.Delete(tempPath);

        var exportSettings = new ExportSettings
        {
            Format = GltfFormat.Binary,
            FileConflictResolution = FileConflictResolution.Overwrite,
            ComponentMask = ~(ComponentType.Camera | ComponentType.Animation),
        };

        var goSettings = new GameObjectExportSettings
        {
            OnlyActiveInHierarchy = true,
            DisabledComponents = false,
        };

        foreach (var root in roots)
            Debug.Log($"[3kv3dd] Export root: {root.name}");

        var export = new GameObjectExport(exportSettings, goSettings);
        if (!export.AddScene(roots, "SampleScene"))
            throw new InvalidOperationException("Falha ao adicionar cena ao export GLB.");

        var success = await export.SaveToFileAndDispose(tempPath);
        if (!success)
            throw new InvalidOperationException("SaveToFileAndDispose retornou false.");

        var tempSize = new FileInfo(tempPath).Length;
        if (tempSize < 1024)
        {
            if (File.Exists(tempPath)) File.Delete(tempPath);
            throw new InvalidOperationException($"GLB invalido ({tempSize} bytes). Verifique meshes/materiais da cena.");
        }

        if (File.Exists(fullPath))
            File.Copy(fullPath, fullPath + ".bak", true);

        File.Copy(tempPath, fullPath, true);
        File.Delete(tempPath);
        Debug.Log($"[3kv3dd] GLB gravado: {fullPath} ({tempSize / (1024f * 1024f):F2} MB)");
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
        json.AppendLine("    \"pixelHeight\": 800,");
        json.AppendLine("    \"bezelPx\": 10,");
        json.AppendLine("    \"borderRadiusPx\": 6");
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
        json.AppendLine("    \"directionalPosition\": [-25.72, 55.16, 44.56]");
        json.AppendLine("  },");

        var existingTowerLamp = ReadExistingJsonBlock("towerLamp");
        if (!string.IsNullOrEmpty(existingTowerLamp))
        {
            json.AppendLine("  \"towerLamp\": {");
            json.Append(existingTowerLamp);
            json.AppendLine("  }");
        }
        else
        {
            json.AppendLine("  \"towerLamp\": {");
            json.AppendLine("    \"rootName\": \"tower lamp\",");
            json.AppendLine("    \"redNode\": \"red\",");
            json.AppendLine("    \"greenNode\": \"green\",");
            json.AppendLine("    \"blinkMs\": 500,");
            json.AppendLine("    \"emissiveIntensity\": 2.5");
            json.AppendLine("  }");
        }

        json.AppendLine("}");

        File.WriteAllText(ConfigPath, json.ToString(), Encoding.UTF8);
    }

    static string ReadExistingJsonBlock(string key)
    {
        if (!File.Exists(ConfigPath)) return null;
        var text = File.ReadAllText(ConfigPath);
        var marker = $"\"{key}\":";
        var start = text.IndexOf(marker, StringComparison.Ordinal);
        if (start < 0) return null;
        start = text.IndexOf('{', start);
        if (start < 0) return null;
        var depth = 0;
        for (var i = start; i < text.Length; i++)
        {
            if (text[i] == '{') depth++;
            else if (text[i] == '}')
            {
                depth--;
                if (depth == 0)
                {
                    var inner = text.Substring(start + 1, i - start - 1).Trim();
                    if (inner.EndsWith(",")) inner = inner[..^1];
                    return inner + Environment.NewLine;
                }
            }
        }
        return null;
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
