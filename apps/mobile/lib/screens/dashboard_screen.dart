import "package:flutter/material.dart";

import "../services/api_service.dart";
import "../services/auth_service.dart";
import "../widgets/mobile_shell.dart";
import "envelope_detail_screen.dart";

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<dynamic> _envelopes = [];
  int _total = 0;
  bool _loading = true;
  String _userName = "Usuário";

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final user = await AuthService.getUser();
      final res = await ApiService.listEnvelopes();
      if (!mounted) return;
      setState(() {
        _userName = user?["name"]?.toString() ?? "Usuário";
        _envelopes = (res["data"] as List<dynamic>? ?? <dynamic>[]);
        _total = (res["total"] as int?) ?? _envelopes.length;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  int _countByStatuses(List<String> statuses) {
    return _envelopes.where((env) => statuses.contains(env["status"])).length;
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
    switch (status) {
      case "draft":
        return "Rascunho";
      case "sent":
        return "Enviado";
      case "in_progress":
        return "Em andamento";
      case "completed":
        return "Concluído";
      case "canceled":
        return "Cancelado";
      case "expired":
        return "Expirado";
      default:
        return status;
    }
  }

  String _formatDate(String? iso) {
    if (iso == null) return "";
    final date = DateTime.tryParse(iso);
    if (date == null) return iso;
    return "${date.day.toString().padLeft(2, "0")}/${date.month.toString().padLeft(2, "0")}/${date.year}";
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return MobileShell(
      title: "Dashboard",
      currentRoute: "/dashboard",
      actions: [
        IconButton(
          onPressed: () {
            setState(() => _loading = true);
            _loadData();
          },
          icon: const Icon(Icons.refresh),
        ),
      ],
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
                children: [
                  Text(
                    "Olá, $_userName",
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: scheme.onSurface,
                        ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    "Acompanhe envelopes, inicie assinaturas e valide documentos.",
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(
                        child: _StatCard(label: "Total", value: "$_total", color: const Color(0xFF1D4ED8)),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _StatCard(label: "Concl.", value: "${_countByStatuses(["completed"])}", color: const Color(0xFF16A34A)),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _StatCard(label: "Pend.", value: "${_countByStatuses(["sent", "in_progress"])}", color: const Color(0xFFD97706)),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _StatCard(label: "Rasc.", value: "${_countByStatuses(["draft"])}", color: const Color(0xFF475569)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Text(
                    "Ações rápidas",
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  const SizedBox(height: 12),
                  _ActionTile(
                    icon: Icons.edit_document,
                    title: "Autoassinar documento",
                    subtitle: "Faça upload, assine e gere código de verificação.",
                    onTap: () => Navigator.pushNamed(context, "/self-sign"),
                  ),
                  _ActionTile(
                    icon: Icons.send_outlined,
                    title: "Enviar para assinatura",
                    subtitle: "Crie um envelope e envie para destinatários.",
                    onTap: () => Navigator.pushNamed(context, "/envelopes/new"),
                  ),
                  _ActionTile(
                    icon: Icons.verified_outlined,
                    title: "Verificar documento",
                    subtitle: "Consulte a autenticidade pelo código público.",
                    onTap: () => Navigator.pushNamed(context, "/verify"),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    "Envelopes recentes",
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  const SizedBox(height: 12),
                  if (_envelopes.isEmpty)
                    const _EmptyState(
                      title: "Nenhum envelope ainda",
                      subtitle: "Use 'Enviar para assinatura' para começar.",
                    )
                  else
                    ..._envelopes.map((env) {
                      final status = env["status"]?.toString() ?? "draft";
                      return Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: scheme.surface,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: scheme.outlineVariant),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.08),
                              blurRadius: 18,
                              offset: Offset(0, 10),
                            ),
                          ],
                        ),
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
                          title: Text(
                            env["title"]?.toString() ?? "Sem título",
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          subtitle: Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Text(
                              "Criado em ${_formatDate(env["created_at"]?.toString())}",
                              style: TextStyle(color: scheme.onSurfaceVariant),
                            ),
                          ),
                          trailing: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: _statusColor(status).withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              _statusLabel(status),
                              style: TextStyle(
                                color: _statusColor(status),
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => EnvelopeDetailScreen(
                                  envelopeId: env["id"].toString(),
                                ),
                              ),
                            );
                          },
                        ),
                      );
                    }),
                ],
              ),
            ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _StatCard({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _ActionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            Theme.of(context).colorScheme.surfaceContainerHighest,
            Theme.of(context).colorScheme.surface,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
        leading: Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Icon(icon, color: Theme.of(context).colorScheme.primary),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(subtitle, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final String title;
  final String subtitle;

  const _EmptyState({
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: Column(
        children: [
          Icon(Icons.inbox_outlined, size: 42, color: Theme.of(context).colorScheme.onSurfaceVariant),
          const SizedBox(height: 12),
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
