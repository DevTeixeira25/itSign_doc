import "package:flutter/material.dart";

import "../services/api_service.dart";
import "../widgets/mobile_shell.dart";

class VerifyScreen extends StatefulWidget {
  const VerifyScreen({super.key});

  @override
  State<VerifyScreen> createState() => _VerifyScreenState();
}

class _VerifyScreenState extends State<VerifyScreen> {
  final _codeCtrl = TextEditingController();
  bool _loading = false;
  String? _error;
  Map<String, dynamic>? _result;

  Future<void> _verify() async {
    setState(() {
      _loading = true;
      _error = null;
      _result = null;
    });
    try {
      final result = await ApiService.verifyDocument(_codeCtrl.text.trim());
      if (!mounted) return;
      setState(() => _result = result);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst("Exception: ", ""));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _formatDate(String? iso) {
    if (iso == null) return "-";
    final date = DateTime.tryParse(iso);
    if (date == null) return iso;
    return "${date.day.toString().padLeft(2, "0")}/${date.month.toString().padLeft(2, "0")}/${date.year} ${date.hour.toString().padLeft(2, "0")}:${date.minute.toString().padLeft(2, "0")}";
  }

  @override
  Widget build(BuildContext context) {
    final valid = _result?["valid"] == true;
    final scheme = Theme.of(context).colorScheme;
    return MobileShell(
      title: "Verificar documento",
      currentRoute: "/verify",
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: scheme.surface,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: scheme.outlineVariant),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  "Código de verificação",
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                const Text(
                  "Cole o código público emitido no certificado de conclusão.",
                  style: TextStyle(color: Color(0xFF64748B)),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _codeCtrl,
                  decoration: const InputDecoration(
                    border: OutlineInputBorder(),
                    hintText: "ABC123XYZ...",
                  ),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton.icon(
                    onPressed: _loading ? null : _verify,
                    icon: _loading
                        ? SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: scheme.onPrimary),
                          )
                        : const Icon(Icons.verified_outlined),
                    label: Text(_loading ? "Verificando..." : "Verificar"),
                  ),
                ),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            _VerifyBanner(
              color: const Color(0xFFDC2626),
              background: const Color(0xFFFEF2F2),
              title: "Falha na verificação",
              message: _error!,
            ),
          ],
          if (_result != null) ...[
            const SizedBox(height: 16),
            _VerifyBanner(
              color: valid ? const Color(0xFF16A34A) : const Color(0xFFD97706),
              background: valid ? const Color(0xFFECFDF5) : const Color(0xFFFFFBEB),
              title: valid ? "Documento válido" : "Integridade inconsistente",
              message: "Integridade: ${_result!["integrityCheck"]}",
            ),
            const SizedBox(height: 16),
            _ResultCard(
              title: "Envelope",
              lines: [
                _Line("Título", _result!["envelope"]?["title"]?.toString() ?? "-"),
                _Line("Concluído em", _formatDate(_result!["envelope"]?["completedAt"]?.toString())),
                _Line("Hash", _result!["certificateHash"]?.toString() ?? "-"),
              ],
            ),
            const SizedBox(height: 16),
            _ResultCard(
              title: "Documento",
              lines: [
                _Line("Arquivo", _result!["document"]?["fileName"]?.toString() ?? "-"),
                _Line("SHA-256", _result!["document"]?["sha256Hash"]?.toString() ?? "-"),
              ],
            ),
            const SizedBox(height: 16),
            _ResultCard(
              title: "Assinaturas",
              lines: [
                for (final signature in (_result!["signatures"] as List<dynamic>? ?? <dynamic>[]))
                  _Line(
                    signature["name"]?.toString() ?? "Assinatura",
                    "${signature["signatureType"] ?? "n/a"} em ${_formatDate(signature["signedAt"]?.toString())}",
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }
}

class _VerifyBanner extends StatelessWidget {
  final Color color;
  final Color background;
  final String title;
  final String message;

  const _VerifyBanner({
    required this.color,
    required this.background,
    required this.title,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: color.withValues(alpha: 0.24)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: TextStyle(color: color, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text(message, style: TextStyle(color: color)),
        ],
      ),
    );
  }
}

class _ResultCard extends StatelessWidget {
  final String title;
  final List<_Line> lines;

  const _ResultCard({required this.title, required this.lines});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          ...lines.map((line) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(line.label, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                    const SizedBox(height: 4),
                    SelectableText(line.value, style: const TextStyle(fontWeight: FontWeight.w700)),
                  ],
                ),
              )),
        ],
      ),
    );
  }
}

class _Line {
  final String label;
  final String value;

  const _Line(this.label, this.value);
}
