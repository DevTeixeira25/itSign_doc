import "dart:io";

import "package:flutter/foundation.dart";

class AppConfig {
  static const String appName = "ITSign";

  static const String _apiBaseUrlFromEnv = String.fromEnvironment(
    "ITSIGN_API_BASE_URL",
    defaultValue: "",
  );

  static String get apiBaseUrl {
    if (_apiBaseUrlFromEnv.isNotEmpty) return _normalizeUrl(_apiBaseUrlFromEnv);
    if (kIsWeb) return "http://127.0.0.1:3001";
    if (Platform.isAndroid) return "http://10.0.2.2:3001";
    if (Platform.isIOS || Platform.isMacOS) return "http://127.0.0.1:3001";
    return "http://127.0.0.1:3001";
  }

  static String _normalizeUrl(String rawUrl) {
    final trimmed = rawUrl.trim();
    if (trimmed.isEmpty) return trimmed;
    final schemeMatch = RegExp(r"^(https?:)//+").firstMatch(trimmed);
    if (schemeMatch == null) {
      return trimmed.replaceAll(RegExp(r"/+$"), "");
    }
    final scheme = schemeMatch.group(1)!;
    final remainder = trimmed.substring(schemeMatch.end).replaceFirst(RegExp(r"^/+"), "");
    return "$scheme//$remainder".replaceAll(RegExp(r"/+$"), "");
  }
}
