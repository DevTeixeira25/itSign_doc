import "package:firebase_auth/firebase_auth.dart";
import "package:flutter/material.dart";

import "../config/app_config.dart";
import "../config/firebase_bootstrap.dart";
import "../services/api_service.dart";

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _loading = false;
  bool _sendingReset = false;
  String? _error;
  String? _message;

  String _firebaseErrorMessage(String code) {
    switch (code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "E-mail ou senha incorretos";
      case "auth/too-many-requests":
        return "Muitas tentativas. Tente novamente mais tarde.";
      case "auth/user-disabled":
        return "Conta desativada";
      case "auth/invalid-email":
        return "E-mail inválido";
      case "auth/network-request-failed":
        return "Falha de rede ao autenticar";
      default:
        return "Erro ao fazer login";
    }
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _loading = true;
      _error = null;
      _message = null;
    });
    try {
      final credential = await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: _emailCtrl.text.trim(),
        password: _passwordCtrl.text,
      );
      final user = credential.user;
      if (user == null) {
        throw Exception("Não foi possível iniciar a sessão.");
      }
      final token = await user.getIdToken(true) ?? "";
      if (token.isEmpty) {
        throw Exception("Não foi possível obter o token da sessão.");
      }
      await ApiService.bootstrapSession(
        firebaseToken: token,
        name: user.displayName?.trim().isNotEmpty == true ? user.displayName!.trim() : (user.email?.split("@").first ?? "Usuário"),
        email: user.email?.trim() ?? "",
        organizationName: "ITSign",
      );
      if (mounted) Navigator.pushReplacementNamed(context, "/dashboard");
    } on FirebaseAuthException catch (e) {
      if (!mounted) return;
      setState(() => _error = _firebaseErrorMessage(e.code));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst("Exception: ", ""));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _sendReset() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) {
      setState(() => _error = "Informe o e-mail para redefinir a senha.");
      return;
    }

    setState(() {
      _sendingReset = true;
      _error = null;
      _message = null;
    });
    try {
      await FirebaseAuth.instance.sendPasswordResetEmail(email: email);
      if (!mounted) return;
      setState(() => _message = "E-mail de redefinição enviado para $email.");
    } on FirebaseAuthException catch (e) {
      if (!mounted) return;
      setState(() => _error = _firebaseErrorMessage(e.code));
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = "Erro ao enviar o e-mail de redefinição.");
    } finally {
      if (mounted) setState(() => _sendingReset = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    final apiHint = AppConfig.apiBaseUrl.contains("10.0.2.2")
        ? "Emulador Android local"
        : AppConfig.apiBaseUrl.contains("127.0.0.1")
            ? "Simulador local"
            : "Ambiente customizado";

    return Scaffold(
      backgroundColor: colorScheme.surfaceContainerLowest,
      body: SafeArea(
        child: Stack(
          children: [
            Positioned(
              top: -120,
              right: -60,
              child: Container(
                width: 260,
                height: 260,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    colors: [Color(0x553B82F6), Color(0x003B82F6)],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                ),
              ),
            ),
            Positioned(
              top: 120,
              left: -70,
              child: Container(
                width: 180,
                height: 180,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    colors: [Color(0x332563EB), Color(0x002563EB)],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                ),
              ),
            ),
            Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 24, 24, 40),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: isDark
                          ? colorScheme.surface.withValues(alpha: 0.96)
                          : Colors.white.withValues(alpha: 0.94),
                      borderRadius: BorderRadius.circular(28),
                      border: Border.all(color: colorScheme.outlineVariant),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: isDark ? 0.24 : 0.08),
                          blurRadius: 32,
                          offset: const Offset(0, 18),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Center(
                          child: Container(
                            width: 72,
                            height: 72,
                            decoration: BoxDecoration(
                              color: colorScheme.primary.withValues(alpha: 0.14),
                              borderRadius: BorderRadius.circular(22),
                            ),
                            child: Icon(Icons.draw_outlined, size: 38, color: colorScheme.primary),
                          ),
                        ),
                        const SizedBox(height: 20),
                        Center(
                          child: Text(
                            "ITSign",
                            style: theme.textTheme.headlineMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: colorScheme.onSurface,
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Center(
                          child: Text(
                            "Entre na sua conta",
                            textAlign: TextAlign.center,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: colorScheme.onSurfaceVariant,
                              height: 1.4,
                            ),
                          ),
                        ),
                        const SizedBox(height: 28),
                        _InfoPanel(
                          title: "Ambiente atual",
                          icon: Icons.cloud_outlined,
                          tone: _PanelTone.info,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      "API configurada",
                                      style: theme.textTheme.labelLarge?.copyWith(
                                        color: colorScheme.primary,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                    decoration: BoxDecoration(
                                      color: colorScheme.surface.withValues(alpha: 0.8),
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                    child: Text(
                                      apiHint,
                                      style: theme.textTheme.labelSmall?.copyWith(
                                        color: colorScheme.primary,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                decoration: BoxDecoration(
                                  color: colorScheme.surfaceContainerLow,
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(color: colorScheme.outlineVariant),
                                ),
                                child: Text(
                                  AppConfig.apiBaseUrl,
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    color: colorScheme.onSurface,
                                    fontWeight: FontWeight.w700,
                                    fontFamily: "monospace",
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (!FirebaseBootstrapState.isAvailable) ...[
                          const SizedBox(height: 14),
                          _InfoPanel(
                            title: "Firebase nativo pendente",
                            icon: Icons.info_outline,
                            tone: _PanelTone.warning,
                            child: Text(
                              FirebaseBootstrapState.lastError ??
                                  "Firebase não foi inicializado corretamente neste build.",
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: isDark ? const Color(0xFFFCD34D) : const Color(0xFF92400E),
                                height: 1.4,
                              ),
                            ),
                          ),
                        ],
                        if (_error != null) ...[
                          const SizedBox(height: 14),
                          _InfoPanel(
                            title: "Falha ao autenticar",
                            icon: Icons.error_outline,
                            tone: _PanelTone.error,
                            child: Text(
                              _error!,
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: colorScheme.error,
                                height: 1.4,
                              ),
                            ),
                          ),
                        ],
                        if (_message != null) ...[
                          const SizedBox(height: 14),
                          _InfoPanel(
                            title: "Tudo certo",
                            icon: Icons.check_circle_outline,
                            tone: _PanelTone.success,
                            child: Text(
                              _message!,
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: const Color(0xFF16A34A),
                                height: 1.4,
                              ),
                            ),
                          ),
                        ],
                        const SizedBox(height: 20),
                        TextField(
                          controller: _emailCtrl,
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          autocorrect: false,
                          enableSuggestions: false,
                          decoration: const InputDecoration(
                            labelText: "E-mail",
                            border: OutlineInputBorder(),
                          ),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _passwordCtrl,
                          obscureText: true,
                          textInputAction: TextInputAction.done,
                          decoration: const InputDecoration(
                            labelText: "Senha",
                            border: OutlineInputBorder(),
                          ),
                          onSubmitted: (_) => _submit(),
                        ),
                        const SizedBox(height: 12),
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: _sendingReset || _loading ? null : _sendReset,
                            child: Text(_sendingReset ? "Enviando..." : "Esqueci minha senha"),
                          ),
                        ),
                        const SizedBox(height: 8),
                        SizedBox(
                          width: double.infinity,
                          height: 54,
                          child: FilledButton(
                            style: FilledButton.styleFrom(
                              backgroundColor: colorScheme.primary,
                              foregroundColor: colorScheme.onPrimary,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(18),
                              ),
                            ),
                            onPressed: _loading || !FirebaseBootstrapState.isAvailable ? null : _submit,
                            child: _loading
                                ? SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: colorScheme.onPrimary,
                                    ),
                                  )
                                : const Text(
                                    "Entrar",
                                    style: TextStyle(fontWeight: FontWeight.w700),
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }
}

enum _PanelTone { info, warning, error, success }

class _InfoPanel extends StatelessWidget {
  final String title;
  final IconData icon;
  final Widget child;
  final _PanelTone tone;

  const _InfoPanel({
    required this.title,
    required this.icon,
    required this.child,
    required this.tone,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final style = switch (tone) {
      _PanelTone.info => (
          background: isDark ? const Color(0xFF111C34) : const Color(0xFFEAF3FF),
          border: isDark ? const Color(0xFF1E3A8A) : const Color(0xFFBFDBFE),
          foreground: const Color(0xFF1D4ED8),
        ),
      _PanelTone.warning => (
          background: isDark ? const Color(0xFF2A1805) : const Color(0xFFFFF7E8),
          border: isDark ? const Color(0xFF92400E) : const Color(0xFFFCD34D),
          foreground: isDark ? const Color(0xFFFCD34D) : const Color(0xFFB45309),
        ),
      _PanelTone.error => (
          background: isDark ? const Color(0xFF2A0C12) : const Color(0xFFFEF2F2),
          border: isDark ? const Color(0xFF7F1D1D) : const Color(0xFFFECACA),
          foreground: isDark ? const Color(0xFFF87171) : const Color(0xFFDC2626),
        ),
      _PanelTone.success => (
          background: isDark ? const Color(0xFF0E2419) : const Color(0xFFECFDF5),
          border: isDark ? const Color(0xFF166534) : const Color(0xFF86EFAC),
          foreground: const Color(0xFF16A34A),
        ),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: style.background,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: style.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: isDark ? 0.18 : 0.04),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: style.foreground),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: style.foreground,
                      ),
                ),
                const SizedBox(height: 8),
                child,
              ],
            ),
          ),
        ],
      ),
    );
  }
}
