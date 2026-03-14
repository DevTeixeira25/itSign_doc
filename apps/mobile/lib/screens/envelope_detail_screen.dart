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
  bool _working = false;
  String? _error;
  String? _verificationCode;

  @override
  void initState() {
    super.initState();
    _loadEnvelope();
  }

  Future<void> _loadEnvelope() async {
    try {
      final data = await ApiService.getEnvelope(widget.envelopeId);
      if (!mounted) return;
      setState(() {
        _envelope = data;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst("Exception: ", "");
      });
    }
  }

  Future<void> _sendEnvelope() async {
    setState(() => _working = true);
    try {
      await ApiService.sendEnvelope(widget.envelopeId);
      await _loadEnvelope();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Envelope enviado.")),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst("Exception: ", ""))),
      );
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _cancelEnvelope() async {
    setState(() => _working = true);
    try {
      await ApiService.cancelEnvelope(widget.envelopeId);
      await _loadEnvelope();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Envelope cancelado.")),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst("Exception: ", ""))),
      );
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _loadVerification() async {
    setState(() => _working = true);
    try {
      final res = await ApiService.getEnvelopeVerification(widget.envelopeId);
      if (!mounted) return;
      setState(() => _verificationCode = res["verificationCode"]?.toString());
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst("Exception: ", ""))),
      );
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case "completed":
        return const Color(0xFF16A34A);
      case "sent":
        return const Color(0xFF2563EB);
      case "in_progress":
        return const Color(0xFFD97706);
      case "canceled":
        return const Color(0xFFDC2626);
      case "expired":
        return const Color(0xFF64748B);
      default:
        return const Color(0xFF475569);
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

  String _formatDateTime(String? iso) {
    if (iso == null) return "";
    final date = DateTime.tryParse(iso);
    if (date == null) return iso;
    return "${date.day.toString().padLeft(2, "0")}/${date.month.toString().padLeft(2, "0")}/${date.year} ${date.hour.toString().padLeft(2, "0")}:${date.minute.toString().padLeft(2, "0")}";
  }

  @override
  Widget build(BuildContext context) {
    final envelope = _envelope;
    final status = envelope?["status"]?.toString() ?? "draft";
    final scheme = Theme.of(context).colorScheme;
    final recipients = envelope?["recipients"] as List<dynamic>? ?? <dynamic>[];
    final auditTrail = envelope?["auditTrail"] as List<dynamic>? ?? <dynamic>[];
    return Scaffold(
      backgroundColor: scheme.surfaceContainerLowest,
      appBar: AppBar(
        title: const Text("Envelope"),
        actions: [
          IconButton(
            onPressed: _loadEnvelope,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    _SurfaceCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            envelope?["title"]?.toString() ?? "Envelope",
                            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                  fontWeight: FontWeight.w800,
                                ),
                            softWrap: true,
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 10,
                            runSpacing: 10,
                            children: [
                              _Badge(
                                label: _statusLabel(status),
                                color: _statusColor(status),
                              ),
                              _DocumentPill(
                                label: envelope?["document"]?["fileName"]?.toString() ?? "Documento",
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          Text(
                            "Criado em ${_formatDateTime(envelope?["createdAt"]?.toString())}",
                            style: const TextStyle(color: Color(0xFF64748B)),
                          ),
                          if (_verificationCode != null) ...[
                            const SizedBox(height: 16),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: scheme.primary.withValues(alpha: 0.08),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: scheme.primary.withValues(alpha: 0.18)),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    "Código de verificação",
                                    style: TextStyle(fontWeight: FontWeight.w700),
                                  ),
                                  const SizedBox(height: 6),
                                  SelectableText(
                                    _verificationCode!,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontFamily: "monospace",
                                    ),
                                    minLines: 1,
                                    maxLines: 4,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    _SurfaceCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            "Ações",
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 14),
                          Wrap(
                            spacing: 12,
                            runSpacing: 12,
                            children: [
                              FilledButton.icon(
                                onPressed: _working || status != "draft" ? null : _sendEnvelope,
                                icon: const Icon(Icons.send_outlined),
                                label: const Text("Enviar envelope"),
                              ),
                              OutlinedButton.icon(
                                onPressed: _working ? null : _loadVerification,
                                icon: const Icon(Icons.verified_outlined),
                                label: const Text("Ver código"),
                              ),
                              OutlinedButton.icon(
                                onPressed: _working || status == "completed" || status == "canceled"
                                    ? null
                                    : _cancelEnvelope,
                                icon: const Icon(Icons.cancel_outlined),
                                label: const Text("Cancelar"),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      "Destinatários",
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 10),
                    ...recipients.map((recipient) {
                      final isSigned = recipient["signed_at"] != null || recipient["signedAt"] != null;
                      return _SurfaceCard(
                        marginBottom: 12,
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            CircleAvatar(
                              radius: 22,
                              backgroundColor: isSigned ? const Color(0xFFDCFCE7) : const Color(0xFFFFEDD5),
                              child: Icon(
                                isSigned ? Icons.check : Icons.schedule,
                                color: isSigned ? const Color(0xFF16A34A) : const Color(0xFFD97706),
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    recipient["name"]?.toString() ?? "Destinatário",
                                    style: const TextStyle(fontWeight: FontWeight.w700),
                                    softWrap: true,
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    recipient["email"]?.toString() ?? "",
                                    style: TextStyle(color: scheme.onSurfaceVariant),
                                    softWrap: true,
                                  ),
                                  const SizedBox(height: 10),
                                  Wrap(
                                    spacing: 8,
                                    runSpacing: 8,
                                    children: [
                                      _MiniInfoPill(
                                        label: isSigned ? "Assinado" : "Pendente",
                                        color: isSigned ? const Color(0xFF16A34A) : const Color(0xFFD97706),
                                      ),
                                      if (recipient["role"] != null)
                                        _MiniInfoPill(
                                          label: recipient["role"].toString(),
                                          color: const Color(0xFF2563EB),
                                        ),
                                      if (recipient["signingOrder"] != null)
                                        _MiniInfoPill(
                                          label: "Ordem ${recipient["signingOrder"]}",
                                          color: const Color(0xFF64748B),
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                    const SizedBox(height: 8),
                    Text(
                      "Trilha de auditoria",
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 10),
                    ...auditTrail.map((event) {
                      return _SurfaceCard(
                        marginBottom: 10,
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              width: 10,
                              height: 10,
                              margin: const EdgeInsets.only(top: 6, right: 12),
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
                                    _actionLabel(event["action"]?.toString() ?? ""),
                                    style: const TextStyle(fontWeight: FontWeight.w700),
                                    softWrap: true,
                                  ),
                                  if (event["actor_email"] != null || event["actorEmail"] != null)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 4),
                                      child: Text(
                                        (event["actor_email"] ?? event["actorEmail"]).toString(),
                                        style: const TextStyle(color: Color(0xFF64748B)),
                                        softWrap: true,
                                      ),
                                    ),
                                  const SizedBox(height: 4),
                                  Text(
                                    _formatDateTime((event["created_at"] ?? event["createdAt"])?.toString()),
                                    style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                  ],
                ),
    );
  }
}

class _Badge extends StatelessWidget {
  final String label;
  final Color color;

  const _Badge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _DocumentPill extends StatelessWidget {
  final String label;

  const _DocumentPill({required this.label});

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 260),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: const Color(0xFFDBEAFE),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.description_outlined, size: 16, color: Color(0xFF1D4ED8)),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Color(0xFF1D4ED8), fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MiniInfoPill extends StatelessWidget {
  final String label;
  final Color color;

  const _MiniInfoPill({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _SurfaceCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double marginBottom;

  const _SurfaceCard({
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.marginBottom = 0,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: EdgeInsets.only(bottom: marginBottom),
      padding: padding,
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 18,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: child,
    );
  }
}
