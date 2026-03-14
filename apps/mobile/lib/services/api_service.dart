import "dart:convert";
import "dart:io";

import "package:http/http.dart" as http;

import "../config/app_config.dart";
import "auth_service.dart";

class ApiService {
  static String get baseUrl => AppConfig.apiBaseUrl;

  static Future<Map<String, String>> _headers({
    bool includeJsonContentType = true,
  }) async {
    final token = await AuthService.getToken();
    return {
      if (includeJsonContentType) "Content-Type": "application/json",
      if (token != null) "Authorization": "Bearer $token",
    };
  }

  static dynamic _decodeBody(http.Response response) {
    if (response.body.isEmpty) return <String, dynamic>{};
    return jsonDecode(response.body);
  }

  static Never _throwResponseError(http.Response response, dynamic data) {
    final message = data is Map<String, dynamic>
        ? data["message"] ?? data["error"] ?? "Erro ${response.statusCode}"
        : "Erro ${response.statusCode}";
    throw Exception(message);
  }

  static Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Object? body,
  }) async {
    final headers = await _headers();
    final response = http.Request(method, Uri.parse("$baseUrl$path"))
      ..headers.addAll(headers)
      ..body = body == null ? "" : jsonEncode(body);
    final streamed = await response.send();
    final res = await http.Response.fromStream(streamed);
    final data = _decodeBody(res);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      _throwResponseError(res, data);
    }
    return (data is Map<String, dynamic>) ? data : <String, dynamic>{};
  }

  static Future<Map<String, dynamic>> _multipart(
    String path, {
    required List<http.MultipartFile> files,
    Map<String, String> fields = const {},
  }) async {
    final uri = Uri.parse("$baseUrl$path");
    final request = http.MultipartRequest("POST", uri);
    request.headers.addAll(await _headers(includeJsonContentType: false));
    request.fields.addAll(fields);
    request.files.addAll(files);
    final streamed = await request.send();
    final res = await http.Response.fromStream(streamed);
    final data = _decodeBody(res);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      _throwResponseError(res, data);
    }
    return (data is Map<String, dynamic>) ? data : <String, dynamic>{};
  }

  // ── Auth bootstrap ──────────────────────────────────────

  static Future<Map<String, dynamic>> loginWithFirebaseToken(String token) async {
    await AuthService.setToken(token);
    try {
      final data = await me();
      await AuthService.setUser(data);
      return data;
    } catch (_) {
      await AuthService.logout();
      rethrow;
    }
  }

  static Future<Map<String, dynamic>> bootstrapSession({
    required String firebaseToken,
    required String name,
    required String email,
    required String organizationName,
  }) async {
    await AuthService.setToken(firebaseToken);
    try {
      final profile = await me();
      await AuthService.setUser(profile);
      return profile;
    } catch (_) {
      final registered = await register(
        organizationName: organizationName,
        name: name,
        email: email,
      );
      final user = (registered["user"] as Map<String, dynamic>? ?? <String, dynamic>{});
      await AuthService.setUser(user);
      return user;
    }
  }

  static Future<Map<String, dynamic>> register({
    required String organizationName,
    required String name,
    required String email,
  }) {
    return _request("POST", "/v1/auth/register", body: {
      "organizationName": organizationName,
      "name": name,
      "email": email,
    });
  }

  static Future<Map<String, dynamic>> me() {
    return _request("GET", "/v1/auth/me");
  }

  static Future<Map<String, dynamic>> updateProfile({String? name}) {
    return _request("PATCH", "/v1/auth/me", body: {"name": name});
  }

  // ── Documents ───────────────────────────────────────────

  static Future<Map<String, dynamic>> uploadDocument(File file) async {
    final multipart = await http.MultipartFile.fromPath("file", file.path);
    return _multipart("/v1/documents", files: [multipart]);
  }

  static Future<Map<String, dynamic>> listDocuments() {
    return _request("GET", "/v1/documents");
  }

  static Future<Map<String, dynamic>> getDocument(String id) {
    return _request("GET", "/v1/documents/$id");
  }

  static Future<List<Map<String, dynamic>>> getDocumentFormFields(String id) async {
    final data = await _request("GET", "/v1/documents/$id/form-fields");
    return (data["data"] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  // ── Envelopes ───────────────────────────────────────────

  static Future<Map<String, dynamic>> createEnvelope({
    required String title,
    required String documentId,
    required List<Map<String, dynamic>> recipients,
    String? expiresAt,
  }) {
    return _request("POST", "/v1/envelopes", body: {
      "title": title,
      "documentId": documentId,
      "recipients": recipients,
      if (expiresAt != null && expiresAt.isNotEmpty) "expiresAt": expiresAt,
    });
  }

  static Future<Map<String, dynamic>> sendEnvelope(String id) {
    return _request("POST", "/v1/envelopes/$id/send");
  }

  static Future<Map<String, dynamic>> listEnvelopes({int page = 1, int pageSize = 20}) {
    return _request("GET", "/v1/envelopes?page=$page&pageSize=$pageSize");
  }

  static Future<Map<String, dynamic>> getEnvelope(String id) {
    return _request("GET", "/v1/envelopes/$id");
  }

  static Future<Map<String, dynamic>> cancelEnvelope(String id) {
    return _request("POST", "/v1/envelopes/$id/cancel");
  }

  // ── Signing (public) ───────────────────────────────────

  static Future<Map<String, dynamic>> getSigningInfo(String token) {
    return _request("GET", "/v1/sign/$token");
  }

  static Future<Map<String, dynamic>> sign(
    String token, {
    required String signatureData,
    required String signatureType,
    Map<String, dynamic>? signaturePosition,
    Map<String, dynamic>? formFields,
    List<Map<String, dynamic>>? overlayFields,
  }) {
    return _request("POST", "/v1/sign/$token", body: {
      "signatureData": signatureData,
      "signatureType": signatureType,
      if (signaturePosition != null) "signaturePosition": signaturePosition,
      if (formFields != null) "formFields": formFields,
      if (overlayFields != null) "overlayFields": overlayFields,
    });
  }

  // ── Verification ────────────────────────────────────────

  static Future<Map<String, dynamic>> verifyDocument(String code) {
    return _request("GET", "/v1/verify/$code");
  }

  static Future<Map<String, dynamic>> getEnvelopeVerification(String envelopeId) {
    return _request("GET", "/v1/envelopes/$envelopeId/verification");
  }

  // ── Certificate / ICP-Brasil ────────────────────────────

  static Future<Map<String, dynamic>> validateCertificate({
    required File certificateFile,
    required String password,
  }) {
    return _multipart(
      "/v1/certificates/validate",
      files: [http.MultipartFile.fromBytes("file", certificateFile.readAsBytesSync(), filename: certificateFile.uri.pathSegments.last)],
      fields: {"password": password},
    );
  }

  static Future<Map<String, dynamic>> signWithCertificate({
    required File certificateFile,
    required String password,
    required String recipientToken,
    required String envelopeId,
    Map<String, dynamic>? signaturePosition,
    Map<String, dynamic>? formFields,
    List<Map<String, dynamic>>? overlayFields,
  }) {
    return _multipart(
      "/v1/sign-with-certificate",
      files: [
        http.MultipartFile.fromBytes(
          "certificate",
          certificateFile.readAsBytesSync(),
          filename: certificateFile.uri.pathSegments.last,
        ),
      ],
      fields: {
        "password": password,
        "recipientToken": recipientToken,
        "envelopeId": envelopeId,
        if (signaturePosition != null)
          "signaturePosition": jsonEncode(signaturePosition),
        if (formFields != null) "formFields": jsonEncode(formFields),
        if (overlayFields != null) "overlayFields": jsonEncode(overlayFields),
      },
    );
  }

  // ── Gov.br ───────────────────────────────────────────────

  static Future<Map<String, dynamic>> govbrAuthorize({
    String? envelopeId,
    String? recipientToken,
    String? documentTitle,
    String? returnPath,
  }) {
    return _request("POST", "/v1/govbr/authorize", body: {
      if (envelopeId != null) "envelopeId": envelopeId,
      if (recipientToken != null) "recipientToken": recipientToken,
      if (documentTitle != null) "documentTitle": documentTitle,
      if (returnPath != null) "returnPath": returnPath,
    });
  }

  static Future<Map<String, dynamic>> govbrPublicAuthorize({
    required String recipientToken,
    String? returnPath,
  }) {
    return _request("POST", "/v1/govbr/public-authorize", body: {
      "recipientToken": recipientToken,
      if (returnPath != null) "returnPath": returnPath,
    });
  }

  static Future<Map<String, dynamic>> govbrSession(String sessionId) {
    return _request("GET", "/v1/govbr/session/$sessionId");
  }

  static Future<Map<String, dynamic>> govbrSign({
    required String sessionId,
    required String recipientToken,
    Map<String, dynamic>? signaturePosition,
    Map<String, dynamic>? formFields,
    List<Map<String, dynamic>>? overlayFields,
  }) {
    return _request("POST", "/v1/govbr/sign/$sessionId", body: {
      "recipientToken": recipientToken,
      "signaturePosition": signaturePosition,
      if (formFields != null) "formFields": formFields,
      if (overlayFields != null) "overlayFields": overlayFields,
    });
  }

  static Future<Map<String, dynamic>> govbrQuickSign({
    required String recipientToken,
    Map<String, dynamic>? formFields,
    List<Map<String, dynamic>>? overlayFields,
  }) {
    return _request("POST", "/v1/govbr/quick-sign", body: {
      "recipientToken": recipientToken,
      if (formFields != null) "formFields": formFields,
      if (overlayFields != null) "overlayFields": overlayFields,
    });
  }
}
