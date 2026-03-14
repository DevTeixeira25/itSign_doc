import "package:flutter/material.dart";
import "package:firebase_auth/firebase_auth.dart";

import "../config/firebase_bootstrap.dart";
import "../main.dart";
import "../services/api_service.dart";
import "../services/auth_service.dart";
import "../widgets/mobile_shell.dart";

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _nameCtrl = TextEditingController();
  Map<String, dynamic>? _user;
  bool _loading = true;
  bool _saving = false;
  bool _sendingReset = false;
  bool _darkMode = false;
  String? _message;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final darkMode = await AuthService.getDarkMode();
    try {
      final user = await ApiService.me();
      await AuthService.setUser(user);
      if (!mounted) return;
      setState(() {
        _user = user;
        _nameCtrl.text = user["name"]?.toString() ?? "";
        _darkMode = darkMode;
        _loading = false;
      });
    } catch (e) {
      final fallback = await AuthService.getUser();
      if (!mounted) return;
      setState(() {
        _user = fallback;
        _nameCtrl.text = fallback?["name"]?.toString() ?? "";
        _darkMode = darkMode;
        _loading = false;
        _error = e.toString().replaceFirst("Exception: ", "");
      });
    }
  }

  Future<void> _toggleDarkMode(bool enabled) async {
    setState(() => _darkMode = enabled);
    await ITSignApp.of(context).setDarkMode(enabled);
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _message = null;
      _error = null;
    });
    try {
      final updated = await ApiService.updateProfile(name: _nameCtrl.text.trim());
      await AuthService.setUser(updated);
      if (!mounted) return;
      setState(() {
        _user = updated;
        _message = "Perfil atualizado com sucesso.";
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst("Exception: ", ""));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _logout() async {
    await AuthService.logout();
    if (!mounted) return;
    Navigator.pushNamedAndRemoveUntil(context, "/login", (_) => false);
  }

  Future<void> _resetPassword() async {
    final email = _user?["email"]?.toString().trim() ?? "";
    if (email.isEmpty) {
      setState(() => _error = "Não foi possível identificar o e-mail da conta.");
      return;
    }
    if (!FirebaseBootstrapState.isAvailable) {
      setState(() => _error = "Redefinição de senha indisponível sem Firebase nativo configurado.");
      return;
    }

    setState(() {
      _sendingReset = true;
      _message = null;
      _error = null;
    });

    try {
      await FirebaseAuth.instance.sendPasswordResetEmail(email: email);
      if (!mounted) return;
      setState(() {
        _message = "E-mail de redefinição enviado para $email.";
      });
    } on FirebaseAuthException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = switch (e.code) {
          "user-not-found" => "Nenhuma conta encontrada com este e-mail.",
          "invalid-email" => "E-mail inválido.",
          "too-many-requests" => "Muitas tentativas. Tente novamente mais tarde.",
          _ => "Erro ao enviar e-mail de redefinição.",
        };
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = "Erro ao enviar e-mail de redefinição.");
    } finally {
      if (mounted) setState(() => _sendingReset = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MobileShell(
      title: "Perfil",
      currentRoute: "/profile",
      child: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                if (_message != null)
                  _StatusCard(
                    color: const Color(0xFF16A34A),
                    background: const Color(0xFFECFDF5),
                    title: _message!,
                  ),
                if (_error != null) ...[
                  if (_message != null) const SizedBox(height: 12),
                  _StatusCard(
                    color: const Color(0xFFDC2626),
                    background: const Color(0xFFFEF2F2),
                    title: _error!,
                  ),
                ],
                if (_message != null || _error != null) const SizedBox(height: 16),
                _ProfileCard(
                  title: "Informações pessoais",
                  child: Column(
                    children: [
                      TextField(
                        controller: _nameCtrl,
                        decoration: const InputDecoration(
                          labelText: "Nome",
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        initialValue: _user?["email"]?.toString() ?? "",
                        readOnly: true,
                        decoration: const InputDecoration(
                          labelText: "E-mail",
                          border: OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        height: 52,
                        child: FilledButton(
                          onPressed: _saving ? null : _save,
                          child: _saving
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                )
                              : const Text("Salvar alterações"),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                _ProfileCard(
                  title: "Conta",
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _InfoLine(label: "ID do usuário", value: _user?["id"]?.toString() ?? "-"),
                      const SizedBox(height: 12),
                      _InfoLine(label: "Organização", value: _user?["organizationId"]?.toString() ?? "-"),
                      const SizedBox(height: 18),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        value: _darkMode,
                        onChanged: _toggleDarkMode,
                        title: const Text("Dark mode"),
                        subtitle: const Text("Ativar tema escuro no app"),
                      ),
                      const SizedBox(height: 10),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: _sendingReset ? null : _resetPassword,
                          icon: _sendingReset
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Icon(Icons.lock_reset_outlined),
                          label: Text(_sendingReset ? "Enviando..." : "Redefinir senha"),
                        ),
                      ),
                      const SizedBox(height: 18),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          onPressed: _logout,
                          icon: const Icon(Icons.logout),
                          label: const Text("Sair"),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }
}

class _ProfileCard extends StatelessWidget {
  final String title;
  final Widget child;

  const _ProfileCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }
}

class _InfoLine extends StatelessWidget {
  final String label;
  final String value;

  const _InfoLine({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: scheme.onSurfaceVariant)),
        const SizedBox(height: 4),
        SelectableText(
          value,
          style: TextStyle(
            fontWeight: FontWeight.w700,
            fontFamily: "monospace",
            color: scheme.onSurface,
          ),
        ),
      ],
    );
  }
}

class _StatusCard extends StatelessWidget {
  final Color color;
  final Color background;
  final String title;

  const _StatusCard({
    required this.color,
    required this.background,
    required this.title,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Text(
        title,
        style: TextStyle(color: color, fontWeight: FontWeight.w700),
      ),
    );
  }
}
