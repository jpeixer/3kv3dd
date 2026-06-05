using UnityEngine;

/// <summary>
/// Marca um mesh como tela embarcada no viewer web (GitHub Pages).
/// O viewer procura este componente ou o nodeName configurado em viewer-config.json.
/// </summary>
public class DisplayScreen : MonoBehaviour
{
    [Tooltip("URL exibida no iframe do viewer web")]
    public string embedUrl = "https://jpeixer.github.io/3kv/";

    [Tooltip("Nome do nó no GLB (deve coincidir com o GameObject)")]
    public string nodeName = "Plane";
}
