using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
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

    static readonly HashSet<string> SkipRootNames = new HashSet<string>
    {
        "Main Camera",
        "Directional Light",
        "Global Volume",
        "Plane",
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

            AssetDatabase.Refresh();
            var fullPath = Path.GetFullPath(GlbPath);
            var sizeMb = new FileInfo(fullPath).Length / (1024f * 1024f);
            Debug.Log($"[3kv3dd] Export concluído: {GlbPath} ({sizeMb:F1} MB)");
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
}
