<#
.SYNOPSIS
    指定されたディレクトリ以下のファイルの内容を1つのファイルに連結します。

.DESCRIPTION
    このスクリプトは、指定されたトップディレクトリから再帰的にファイルを検索し、
    それらの内容を1つの出力ファイルにまとめます。
    各ファイルの内容の前には、トップディレクトリからの相対パスがヘッダーとして挿入されます。
    正規表現を使用して、特定のファイルを除外することも可能です。
    ファイルの読み書きはすべてUTF-8で行われます。

.PARAMETER TopDirectoryPath
    連結したいファイルが格納されているトップディレクトリのパスを指定します。

.PARAMETER OutputFilePath
    連結した内容を保存する出力ファイルのパスを指定します。
    ファイルが既に存在する場合は上書きされます。

.PARAMETER ExcludeRegex
    処理から除外したいファイルを指定するための正規表現です。
    この正規表現は、ファイルのフルパスに対して評価されます。
    (例: '\\.log$', '\\node_modules\\', '\\.git\\')

.EXAMPLE
    PS> .\Combine-Files.ps1 -TopDirectoryPath "C:\MyProject\src" -OutputFilePath "C:\output\combined.txt"

    C:\MyProject\src 以下のすべてのファイルの内容を C:\output\combined.txt に連結します。

.EXAMPLE
    PS> .\Combine-Files.ps1 -TopDirectoryPath ".\src" -OutputFilePath ".\combined.txt" -ExcludeRegex "\\obj\\"

    カレントディレクトリの src フォルダ以下のファイルを連結しますが、パスに "obj" フォルダを含むファイルは除外します。
#>
param(
    [Parameter(Mandatory = $true, HelpMessage = "対象のファイルを格納するトップディレクトリのパスを指定してください。")]
    [string]$TopDirectoryPath,

    [Parameter(Mandatory = $true, HelpMessage = "内容をまとめたファイルの出力先パスを指定してください。")]
    [string]$OutputFilePath,

    [Parameter(Mandatory = $false, HelpMessage = "除外するファイルを指定する正規表現です。フルパスに対してマッチングします。")]
    [string]$ExcludeRegex
)

try {
    # パスの解決と検証
    $resolvedTopDir = Resolve-Path -Path $TopDirectoryPath -ErrorAction Stop
    if (-not (Test-Path -Path $resolvedTopDir -PathType Container)) {
        throw "指定されたトップディレクトリは存在しないか、ディレクトリではありません: $TopDirectoryPath"
    }
    $absoluteTopDirectoryPath = $resolvedTopDir.Path

    # 出力ファイルのディレクトリが存在しない場合は作成
    $outputDir = Split-Path -Path $OutputFilePath -Parent
    if ($outputDir -and (-not (Test-Path -Path $outputDir))) {
        Write-Host "出力ディレクトリを作成します: $outputDir"
        New-Item -Path $outputDir -ItemType Directory -Force | Out-Null
    }

    # BOMなしUTF-8エンコーディングを定義
    $utf8NoBomEncoding = New-Object System.Text.UTF8Encoding($false)

    # 出力ファイルを初期化
    Set-Content -Path $OutputFilePath -Value "" -Encoding $utf8NoBomEncoding

    # ファイルの検索
    Write-Host "🔍 ファイルを検索しています... (ディレクトリ: $absoluteTopDirectoryPath)"
    $files = Get-ChildItem -Path $absoluteTopDirectoryPath -Recurse -File -ErrorAction SilentlyContinue

    # 除外フィルタの適用
    $initialCount = $files.Count
    if (-not [string]::IsNullOrEmpty($ExcludeRegex)) {
        Write-Host "🔬 除外フィルタを適用しています... (正規表現: $ExcludeRegex)"
        # 正規表現のエスケープ文字を考慮して -notmatch を使用
        $files = $files | Where-Object { $_.FullName -notmatch $ExcludeRegex }
        Write-Host "  $($initialCount) ファイル中 $($initialCount - $files.Count) ファイルを除外しました。"
    }

    if ($files.Count -eq 0) {
        Write-Warning "処理対象のファイルが見つかりませんでした。"
        return
    }

    Write-Host "📝 $($files.Count) 個のファイル内容を連結します..."

    # 各ファイルを処理して追記
    foreach ($file in $files) {
        try {
            # 相対パスを計算
            $relativePath = $file.FullName.Substring($absoluteTopDirectoryPath.Length).TrimStart([System.IO.Path]::DirectorySeparatorChar)

            # ヘッダーとファイル内容を準備
            $header = "--- $relativePath ---"
            # ファイル内容をUTF-8として読み込み
            $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8 -ErrorAction Stop
            
            # 出力データを作成
            $outputBlock = @"
$header
$content

"@
            # ファイルに追記
            Add-Content -Path $OutputFilePath -Value $outputBlock -Encoding $utf8NoBomEncoding

        }
        catch {
            Write-Warning "ファイル $($file.FullName) の処理中にエラーが発生しました: $($_.Exception.Message)"
        }
    }

    Write-Host "✅ 処理が完了しました。出力ファイル: $OutputFilePath"

}
catch {
    Write-Error "スクリプトの実行中に致命的なエラーが発生しました: $($_.Exception.Message)"
}