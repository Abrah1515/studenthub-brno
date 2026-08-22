# Android TWA

Tato složka obsahuje tenký Trusted Web Activity obal veřejného StudentHubu. Neobsahuje vlastní WebView ani školní přihlášení. Android Browser Helper otevře ověřený web v podporovaném prohlížeči a externí domény ponechá prohlížeči.

## Důležitá podmínka aktualizace

Před produkčním sestavením zjistěte v Google Play Console původní `applicationId`, aktuální `versionCode` a SHA-256 otisk App Signing certifikátu. Repozitář před vznikem této složky žádnou Android identitu neobsahoval, proto výchozí `cz.studenthub.brno` a `versionCode=2` slouží pouze k lokálnímu ověření buildu. Aktualizace již nainstalované aplikace je možná jen se zcela shodným package ID a podpisovou identitou a s vyšším `versionCode`.

## Nástroje

- Android Gradle Plugin 8.13.0 a Gradle 8.14.5;
- JDK 17 nebo novější podporované AGP (projekt kompiluje zdrojově pro Java 17);
- `compileSdk=36`, `targetSdk=36`, `minSdk=23`;
- Android Browser Helper 2.7.3.

Nastavte `ANDROID_HOME` a JDK. V PowerShellu lze použít JBR z Android Studia:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
```

## Lokální nepodepsaný a debug build

```powershell
cd android
.\gradlew.bat lint bundleRelease assembleRelease assembleDebug
```

Výstupy jsou v `android/app/build/outputs/bundle/release/` a `android/app/build/outputs/apk/`. Release výstup bez podpisových proměnných není určen k instalaci ani do Google Play.

## Produkční podpis bez tajemství v Gitu

Keystore ponechte mimo repozitář nebo v chráněném CI úložišti. Hodnoty lze zadat přes uživatelský `~/.gradle/gradle.properties` (nikdy ne do projektového souboru) nebo jako `ORG_GRADLE_PROJECT_*` tajemství CI:

```text
studentHubPackageId=<původní package ID z Play Console>
studentHubVersionCode=<číslo vyšší než poslední publikovaný build>
studentHubVersionName=<veřejná verze>
studentHubKeystorePath=C:/bezpecne/uloziste/upload-keystore.jks
studentHubKeystorePassword=<tajemství>
studentHubKeyAlias=<alias>
studentHubKeyPassword=<tajemství>
```

Pak spusťte `gradlew.bat clean lint bundleRelease assembleRelease`. Podpis zkontrolujte přes `apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk` a AAB přes `jarsigner -verify`. Produkční upload key se může lišit od App Signing certifikátu: do webového `assetlinks.json` patří SHA-256 otisk certifikátu, kterým Google Play podepisuje aplikaci pro uživatele. Pro přímé APK přidejte i otisk použitého certifikátu.

## Digital Asset Links

Ve Vercelu nastavte serverové proměnné `ANDROID_PACKAGE_ID` a `ANDROID_SHA256_CERT_FINGERPRINTS` (více otisků oddělte čárkou). Endpoint `/.well-known/assetlinks.json` bez platných hodnot vrací prázdné pole, aby web nedůvěřoval neznámé aplikaci. Po nasazení ověřte shodu domény, package ID a certifikátu pomocí Digital Asset Links API nebo Android Studio App Links Assistant.

## Ruční ověření před Play Console

Na fyzických podporovaných zařízeních proveďte čistou instalaci, aktualizaci poslední publikované verze, interní odkazy, návrat z externího odkazu, GPS, push a instalaci PWA z Chrome. Ruční instalace mimo Google Play může vždy zobrazit systémové upozornění na neznámý zdroj; to není stejné jako varování kvůli starému target SDK. Projekt targetuje API 36, takže příčinu varování o zastaralém cíli neobsahuje.
