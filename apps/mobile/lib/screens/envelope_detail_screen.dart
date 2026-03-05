import "package:flutter/material.dart";
import "../services/api_service.dart";

class EnvelopeDetailScreen extends StatefulWidget {
  final String envelopeId;

  const EnvelopeDetailScreen({super.key, required this.envelopeId});

  @override
  State<EnvelopeDetailScreen> createState() => _EnvelopeDetailScreenState();
}

class _EnvelopeDetailScreenState extends State<EnvelopeDetailScreen> {
  Map<String, dynamic>? _envelope;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadEnvelope();
  }

  Future<void> _loadEnvelope() async {
    try {
      final data = await ApiService.getEnvelope(widget.envelopeId);
      if (mounted) setState(() { _envelope = data; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _loading = false; });
    }
  }

  String _statusLabel(String status) {
    const labels = {
      "draft": "Rascunho",
      "sent": "Enviado",
      "in_progress": "Em andamento",
      "completed": "Concluído",
      "canceled": "Cancelado",
      "expired": "Expirado",
    };
    return labels[status] ?? status;
  }

  String _actionLabel(String action) {
    const labels = {
      "envelope_created": "Envelope criado",
      "envelope_sent": "Envelope enviado",
      "envelope_completed": "Envelope concluído",
      "envelope_canceled": "Envelope cancelado",
      "signature_completed": "Assinatura realizada",
      "recipient_viewed": "Destinatário visualizou",
      "certificate_generated": "Certificado gerado",
      "document_uploaded": "Documento enviado",
    };
    return labels[action] ?? action;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_envelope?["title"] ?? "Envelope")),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _envelope == null
              ? const Center(child: Text("Erro ao carregar"))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    // Status
                    Card(
                      child: ListTile(
                        title: const Text("Status"),
                        trailing: Chip(label: Text(_statusLabel(_envelope!["status"]))),
                      ),
                    ),
                    const SizedBox(height: 8),

                    // Document
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.description),
                        title: Text(_envelope!["document"]?["fileName"] ?? "Documento"),
                        subtitle: Text(_envelope!["document"]?["mimeType"] ?? ""),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Recipients
                    Text("Destinatários", style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    ...(_envelope!["recipients"] as List<dynamic>).map((r) => Card(
                      margin: const EdgeInsets.only(bottom: 6),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: r["signed_at"] != null ? Colors.green : Colors.grey.shade300,
                          child: Icon(
                            r["signed_at"] != null ? Icons.check : Icons.schedule,
                            color: Colors.white,
                            size: 20,
                          ),
                        ),
                        title: Text(r["name"]),
                        subtitle: Text(r["email"]),
                        trailing: Text(
                          r["signed_at"] != null ? "Assinado" : "Pendente",
                          style: TextStyle(
                            color: r["signed_at"] != null ? Colors.green : Colors.orange,
                            fontWeight: FontWeight.w600,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    )),

                    const SizedBox(height: 16),

                    // Audit trail
                    Text("Trilha de Auditoria", style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    if ((_envelope!["auditTrail"] as List<dynamic>).isEmpty)
                      const Text("Nenhum evento", style: TextStyle(color: Colors.grey))
                    else
                      ...(_envelope!["auditTrail"] as List<dynamic>).map((event) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              width: 10,
                              height: 10,
                              margin: const EdgeInsets.only(top: 5, right: 12),
                              decoration: const BoxDecoration(
                                color: Color(0xFF2563EB),
                                shape: BoxShape.circle,
                              ),
                            ),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _actionLabel(event["action"]),
                                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                                  ),
                                  if (event["actor_email"] != null)
                                    Text(event["actor_email"], style: const TextStyle(fontSize: 12, color: Colors.grey)),
                                  Text(
                                    _formatDateTime(event["created_at"]),
                                    style: const TextStyle(fontSize: 11, color: Colors.grey),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      )),
                  ],
                ),
    );
  }

  String _formatDateTime(String? iso) {
    if (iso == null) return "";
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    return "${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}";
  }
}
