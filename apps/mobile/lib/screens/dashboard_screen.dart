import "package:flutter/material.dart";
import "../services/api_service.dart";
import "../services/auth_service.dart";
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
  String? _userName;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final user = await AuthService.getUser();
      final res = await ApiService.listEnvelopes();
      if (mounted) {
        setState(() {
          _userName = user?["name"] ?? "Usuário";
          _envelopes = res["data"] as List<dynamic>;
          _total = res["total"] as int;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() { _loading = false; });
    }
  }

  Future<void> _logout() async {
    await AuthService.logout();
    if (mounted) Navigator.pushReplacementNamed(context, "/login");
  }

  Color _statusColor(String status) {
    switch (status) {
      case "completed": return Colors.green;
      case "sent": return Colors.blue;
      case "in_progress": return Colors.orange;
      case "canceled": return Colors.red;
      case "expired": return Colors.grey;
      default: return Colors.blueGrey;
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case "draft": return "Rascunho";
      case "sent": return "Enviado";
      case "in_progress": return "Em andamento";
      case "completed": return "Concluído";
      case "canceled": return "Cancelado";
      case "expired": return "Expirado";
      default: return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("ITSign"),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () { setState(() { _loading = true; }); _loadData(); },
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: _logout,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text("Olá, $_userName", style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 4),
                  Text("$_total envelope(s)", style: const TextStyle(color: Colors.grey)),
                  const SizedBox(height: 24),

                  // Stats row
                  Row(
                    children: [
                      _StatCard(
                        label: "Concluídos",
                        value: _envelopes.where((e) => e["status"] == "completed").length.toString(),
                        color: Colors.green,
                      ),
                      const SizedBox(width: 12),
                      _StatCard(
                        label: "Pendentes",
                        value: _envelopes.where((e) => e["status"] == "sent" || e["status"] == "in_progress").length.toString(),
                        color: Colors.orange,
                      ),
                      const SizedBox(width: 12),
                      _StatCard(
                        label: "Rascunhos",
                        value: _envelopes.where((e) => e["status"] == "draft").length.toString(),
                        color: Colors.blueGrey,
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  Text("Envelopes recentes", style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 12),

                  if (_envelopes.isEmpty)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.all(40),
                        child: Text("Nenhum envelope ainda", style: TextStyle(color: Colors.grey)),
                      ),
                    )
                  else
                    ..._envelopes.map((env) => Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ListTile(
                        title: Text(env["title"] ?? "Sem título"),
                        subtitle: Text(
                          _formatDate(env["created_at"]),
                          style: const TextStyle(fontSize: 12),
                        ),
                        trailing: Chip(
                          label: Text(
                            _statusLabel(env["status"]),
                            style: const TextStyle(fontSize: 11, color: Colors.white),
                          ),
                          backgroundColor: _statusColor(env["status"]),
                          padding: EdgeInsets.zero,
                          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => EnvelopeDetailScreen(envelopeId: env["id"]),
                            ),
                          );
                        },
                      ),
                    )),
                ],
              ),
            ),
    );
  }

  String _formatDate(String? iso) {
    if (iso == null) return "";
    final d = DateTime.tryParse(iso);
    if (d == null) return iso;
    return "${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}";
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _StatCard({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Text(value, style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: color)),
              const SizedBox(height: 4),
              Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
            ],
          ),
        ),
      ),
    );
  }
}
