import "dart:convert";
import "dart:typed_data";
import "dart:ui" as ui;
import "package:flutter/material.dart";
import "package:signature/signature.dart";
import "../services/api_service.dart";

class SignScreen extends StatefulWidget {
  final String token;

  const SignScreen({super.key, required this.token});

  @override
  State<SignScreen> createState() => _SignScreenState();
}

class _SignScreenState extends State<SignScreen> {
  Map<String, dynamic>? _info;
  bool _loading = true;
  bool _signing = false;
  bool _done = false;
  String? _error;
  String _mode = "draw"; // "draw" or "type"
  final _nameCtrl = TextEditingController();

  final SignatureController _signatureCtrl = SignatureController(
    penStrokeWidth: 3,
    penColor: Colors.black,
    exportBackgroundColor: Colors.white,
  );

  @override
  void initState() {
    super.initState();
    _loadInfo();
  }

  Future<void> _loadInfo() async {
    try {
      final data = await ApiService.getSigningInfo(widget.token);
      if (mounted) {
        setState(() {
          _info = data;
          _loading = false;
          if (data["alreadySigned"] == true) _done = true;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceFirst("Exception: ", "");
          _loading = false;
        });
      }
    }
  }

  Future<void> _handleSign() async {
    setState(() { _error = null; _signing = true; });

    String signatureData;
    String signatureType;

    if (_mode == "draw") {
      if (_signatureCtrl.isEmpty) {
        setState(() { _error = "Desenhe sua assinatura"; _signing = false; });
        return;
      }
      final data = await _signatureCtrl.toPngBytes();
      if (data == null) {
        setState(() { _error = "Erro ao capturar assinatura"; _signing = false; });
        return;
      }
      signatureData = base64Encode(data);
      signatureType = "draw";
    } else {
      if (_nameCtrl.text.trim().isEmpty) {
        setState(() { _error = "Digite seu nome"; _signing = false; });
        return;
      }
      signatureData = _nameCtrl.text.trim();
      signatureType = "type";
    }

    try {
      await ApiService.sign(
        widget.token,
        signatureData: signatureData,
        signatureType: signatureType,
      );
      if (mounted) setState(() { _done = true; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString().replaceFirst("Exception: ", ""); });
    } finally {
      if (mounted) setState(() { _signing = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_error != null && _info == null) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 64, color: Colors.red),
                const SizedBox(height: 16),
                Text(_error!, textAlign: TextAlign.center),
              ],
            ),
          ),
        ),
      );
    }

    if (_done) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.check_circle, size: 80, color: Colors.green),
                const SizedBox(height: 16),
                const Text(
                  "Documento assinado!",
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Text(
                  "Sua assinatura foi registrada para \"${_info?["envelopeTitle"]}\".",
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.grey),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text("Assinar Documento")),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Document info card
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _info!["envelopeTitle"] ?? "",
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "Arquivo: ${_info!["documentFileName"]}",
                      style: const TextStyle(color: Colors.grey, fontSize: 13),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      "Olá, ${_info!["recipientName"]}! Você foi convidado a assinar este documento.",
                      style: const TextStyle(fontSize: 14),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            if (_error != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red.shade200),
                ),
                child: Text(_error!, style: TextStyle(color: Colors.red.shade700)),
              ),

            // Mode toggle
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => setState(() { _mode = "draw"; }),
                    icon: const Icon(Icons.draw),
                    label: const Text("Desenhar"),
                    style: _mode == "draw"
                        ? OutlinedButton.styleFrom(
                            backgroundColor: const Color(0xFF2563EB).withOpacity(0.1),
                            side: const BorderSide(color: Color(0xFF2563EB)),
                          )
                        : null,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => setState(() { _mode = "type"; }),
                    icon: const Icon(Icons.keyboard),
                    label: const Text("Digitar"),
                    style: _mode == "type"
                        ? OutlinedButton.styleFrom(
                            backgroundColor: const Color(0xFF2563EB).withOpacity(0.1),
                            side: const BorderSide(color: Color(0xFF2563EB)),
                          )
                        : null,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Signature area
            if (_mode == "draw") ...[
              Container(
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey.shade300, width: 2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: Signature(
                    controller: _signatureCtrl,
                    height: 200,
                    backgroundColor: Colors.white,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: () => _signatureCtrl.clear(),
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text("Limpar"),
                ),
              ),
            ] else ...[
              TextField(
                controller: _nameCtrl,
                style: const TextStyle(fontSize: 24, fontStyle: FontStyle.italic),
                decoration: const InputDecoration(
                  labelText: "Nome completo",
                  border: OutlineInputBorder(),
                  hintText: "Seu nome como assinatura",
                ),
              ),
            ],

            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton.icon(
                onPressed: _signing ? null : _handleSign,
                icon: _signing
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.check),
                label: Text(_signing ? "Assinando…" : "Assinar documento"),
              ),
            ),

            const SizedBox(height: 12),
            const Text(
              "Ao assinar, você concorda que esta assinatura eletrônica tem validade legal.",
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _signatureCtrl.dispose();
    _nameCtrl.dispose();
    super.dispose();
  }
}
