param([string]$KotlinVersion = '2.1.20')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$gradleCache = if ($env:GRADLE_USER_HOME) {$env:GRADLE_USER_HOME} else {Join-Path $env:USERPROFILE '.gradle'}
$cacheRoot = Join-Path $gradleCache 'caches/modules-2/files-2.1'
$libraries = @(
    "org.jetbrains.kotlin/kotlin-compiler-embeddable/$KotlinVersion",
    "org.jetbrains.kotlin/kotlin-stdlib/$KotlinVersion",
    "org.jetbrains.kotlin/kotlin-script-runtime/$KotlinVersion",
    'org.jetbrains.kotlin/kotlin-reflect',
    "org.jetbrains.kotlin/kotlin-daemon-embeddable/$KotlinVersion",
    'org.jetbrains.intellij.deps/trove4j',
    'org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm',
    'org.jetbrains/annotations'
)
$jars = foreach ($library in $libraries) {
    Get-ChildItem (Join-Path $cacheRoot $library) -Filter '*.jar' -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
}
$classPath = $jars -join [IO.Path]::PathSeparator
$outputDir = Join-Path ([IO.Path]::GetTempPath()) ('vega-remux-test-' + [guid]::NewGuid())
New-Item -ItemType Directory $outputDir | Out-Null
& java -cp $classPath org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -classpath $classPath -d $outputDir (Join-Path $repoRoot 'native-src/android/com/vega/RemuxPipeInputStream.kt') (Join-Path $PSScriptRoot 'tests/RemuxPipeInputStreamTest.kt')
if ($LASTEXITCODE -ne 0) {exit $LASTEXITCODE}
& java -cp "$outputDir$([IO.Path]::PathSeparator)$classPath" RemuxPipeInputStreamTestKt
exit $LASTEXITCODE
