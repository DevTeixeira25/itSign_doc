import "dart:convert";
import "package:http/http.dart" as http;
import "auth_service.dart";

class ApiService {
  // Use 10.0.2.2 for Android emulator (maps to host localhost)
  static const String baseUrl = "http://10.0.2.2:3001";

  static Future<Map<String, String>> _headers() async {
    final token = await AuthService.getToken();
    return {
      "Content-Type": "application/json",
      if (token != null) "Authorization": "Bearer $token",
    };
  }

  // ── Auth ────────────────────────────────────────────────

  static Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await http.post(
      Uri.parse("$baseUrl/v1/auth/login"),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"email": email, "password": password}),
    );
    final data = jsonDecode(res.body);
    if (res.statusCode != 200) throw Exception(data["message"] ?? "Erro ao fazer login");
    await AuthService.setToken(data["accessToken"]);
    await AuthService.setUser(data["user"]);
    return data;
  }

  static Future<Map<String, dynamic>> register({
    required String organizationName,
    required String name,
    required String email,
    required String password,
  }) async {
    final res = await http.post(
      Uri.parse("$baseUrl/v1/auth/register"),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({
        "organizationName": organizationName,
        "name": name,
        "email": email,
        "password": password,
      }),
    );
    final data = jsonDecode(res.body);
    if (res.statusCode != 201) throw Exception(data["message"] ?? "Erro ao registrar");
    await AuthService.setToken(data["accessToken"]);
    await AuthService.setUser(data["user"]);
    return data;
  }

  // ── Envelopes ───────────────────────────────────────────

  static Future<Map<String, dynamic>> listEnvelopes({int page = 1}) async {
    final headers = await _headers();
    final res = await http.get(
      Uri.parse("$baseUrl/v1/envelopes?page=$page&pageSize=20"),
      headers: headers,
    );
    final data = jsonDecode(res.body);
    if (res.statusCode != 200) throw Exception(data["message"] ?? "Erro ao listar envelopes");
    return data;
  }

  static Future<Map<String, dynamic>> getEnvelope(String id) async {
    final headers = await _headers();
    final res = await http.get(
      Uri.parse("$baseUrl/v1/envelopes/$id"),
      headers: headers,
    );
    final data = jsonDecode(res.body);
    if (res.statusCode != 200) throw Exception(data["message"] ?? "Erro ao carregar envelope");
    return data;
  }

  // ── Signing (public) ───────────────────────────────────

  static Future<Map<String, dynamic>> getSigningInfo(String token) async {
    final res = await http.get(Uri.parse("$baseUrl/v1/sign/$token"));
    final data = jsonDecode(res.body);
    if (res.statusCode != 200) throw Exception(data["message"] ?? "Link inválido");
    return data;
  }

  static Future<Map<String, dynamic>> sign(
    String token, {
    required String signatureData,
    required String signatureType,
  }) async {
    final res = await http.post(
      Uri.parse("$baseUrl/v1/sign/$token"),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({
        "signatureData": signatureData,
        "signatureType": signatureType,
      }),
    );
    final data = jsonDecode(res.body);
    if (res.statusCode != 200) throw Exception(data["message"] ?? "Erro ao assinar");
    return data;
  }
}
