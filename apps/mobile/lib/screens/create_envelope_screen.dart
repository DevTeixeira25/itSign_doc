import "dart:io";

import "package:file_picker/file_picker.dart";
import "package:flutter/material.dart";

import "../services/api_service.dart";
import "../widgets/mobile_shell.dart";

class CreateEnvelopeScreen extends StatefulWidget {
  const CreateEnvelopeScreen({super.key});

  @override
  State<CreateEnvelopeScreen> createState() => _CreateEnvelopeScreenState();
}

class _CreateEnvelopeScreenState extends State<CreateEnvelopeScreen> {
  final _titleCtrl = TextEditingController();
  final List<_RecipientForm> _recipients = [_RecipientForm()];
  File? _selectedFile;
  bool _loading = false;
  String? _error;
  Map<String, dynamic>? _result;

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ["pdf"],
    );
    if (result == null || result.files.single.path == null) return;
    final file = File(result.files.single.path!);
    setState(() {
      _selectedFile = file;
      if (_titleCtrl.text.trim().isEmpty) {
        _titleCtrl.text = result.files.single.name.replaceAll(RegExp(r"\.pdf$", caseSensitive: false), "");
      }
    });
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _loading = true;
      _error = null;
      _result = null;
    });
    try {
      if (_selectedFile == null) {
        throw Exception("Selecione um PDF.");
      }
      if (_titleCtrl.text.trim().isEmpty) {
        throw Exception("Informe o título do envelope.");
      }
      final recipients = _recipients.map((recipient) => recipient.toMap()).toList();
      final hasInvalid = recipients.any((recipient) =>
          (recipient["name"] as String).trim().isEmpty ||
          (recipient["email"] as String).trim().isEmpty);
      if (hasInvalid) throw Exception("Preencha nome e e-mail de todos os destinatários.");

      final document = await ApiService.uploadDocument(_selectedFile!);
      final envelope = await ApiService.createEnvelope(
        title: _titleCtrl.text.trim(),
        documentId: document["id"].toString(),
        recipients: recipients,
      );
      await ApiService.sendEnvelope(envelope["id"].toString());

      if (!mounted) return;
      setState(() => _result = envelope);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst("Exception: ", ""));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return MobileShell(
      title: "Novo envelope",
      currentRoute: "/envelopes/new",
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _SectionCard(
            title: "Documento",
            subtitle: "Faça upload do PDF e defina o título do envelope.",
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                OutlinedButton.icon(
                  onPressed: _loading ? null : _pickFile,
                  icon: const Icon(Icons.upload_file_outlined),
                  label: Text(_selectedFile == null ? "Selecionar PDF" : "Trocar arquivo"),
                ),
                if (_selectedFile != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    _selectedFile!.uri.pathSegments.last,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ],
                const SizedBox(height: 16),
                TextField(
                  controller: _titleCtrl,
                  decoration: const InputDecoration(
                    labelText: "Título",
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _SectionCard(
            title: "Destinatários",
            subtitle: "Portado do web: nome, e-mail, papel e ordem de assinatura.",
            child: Column(
              children: [
                for (var index = 0; index < _recipients.length; index++) ...[
                  _RecipientEditor(
                    key: ValueKey("recipient-$index"),
                    form: _recipients[index],
                    index: index,
                    canRemove: _recipients.length > 1,
                    onRemove: () => setState(() => _recipients.removeAt(index)),
                  ),
                  if (index < _recipients.length - 1) const SizedBox(height: 12),
                ],
                const SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: _loading
                        ? null
                        : () => setState(() {
                              _recipients.add(_RecipientForm(order: _recipients.length + 1));
                            }),
                    icon: const Icon(Icons.add),
                    label: const Text("Adicionar destinatário"),
                  ),
                ),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            _MessageCard(
              color: const Color(0xFFDC2626),
              background: const Color(0xFFFEF2F2),
              title: "Falha ao criar envelope",
              message: _error!,
            ),
          ],
          if (_result != null) ...[
            const SizedBox(height: 16),
            _SectionCard(
              title: "Envelope enviado",
              subtitle: "Os links públicos já foram gerados pela API.",
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text("ID: ${_result!["id"]}", style: const TextStyle(fontFamily: "monospace")),
                  const SizedBox(height: 12),
                  ...((_result!["recipients"] as List<dynamic>).map((recipient) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            recipient["name"].toString(),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 4),
                          SelectableText(
                            recipient["accessToken"].toString(),
                            style: const TextStyle(
                              fontFamily: "monospace",
                              color: Color(0xFF475569),
                            ),
                          ),
                        ],
                      ),
                    );
                  })),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          SizedBox(
            height: 54,
            child: FilledButton.icon(
              onPressed: _loading ? null : _submit,
              icon: _loading
                  ? SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: scheme.onPrimary),
                    )
                  : const Icon(Icons.send_outlined),
              label: Text(_loading ? "Enviando..." : "Criar e enviar envelope"),
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    for (final recipient in _recipients) {
      recipient.dispose();
    }
    super.dispose();
  }
}

class _RecipientForm {
  final TextEditingController nameCtrl;
  final TextEditingController emailCtrl;
  String role = "signer";
  int order;

  _RecipientForm({
    String name = "",
    String email = "",
    this.order = 1,
  })  : nameCtrl = TextEditingController(text: name),
        emailCtrl = TextEditingController(text: email);

  Map<String, dynamic> toMap() => {
        "name": nameCtrl.text.trim(),
        "email": emailCtrl.text.trim(),
        "role": role,
        "signingOrder": order,
      };

  void dispose() {
    nameCtrl.dispose();
    emailCtrl.dispose();
  }
}

class _RecipientEditor extends StatelessWidget {
  final _RecipientForm form;
  final int index;
  final bool canRemove;
  final VoidCallback onRemove;

  const _RecipientEditor({
    super.key,
    required this.form,
    required this.index,
    required this.canRemove,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Text("Destinatário ${index + 1}", style: const TextStyle(fontWeight: FontWeight.w700)),
              const Spacer(),
              if (canRemove)
                IconButton(
                  onPressed: onRemove,
                  icon: const Icon(Icons.close),
                ),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            controller: form.nameCtrl,
            decoration: const InputDecoration(labelText: "Nome", border: OutlineInputBorder()),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: form.emailCtrl,
            decoration: const InputDecoration(labelText: "E-mail", border: OutlineInputBorder()),
          ),
          const SizedBox(height: 10),
          LayoutBuilder(
            builder: (context, constraints) {
              final compact = constraints.maxWidth < 420;
              final roleField = DropdownButtonFormField<String>(
                initialValue: form.role,
                isExpanded: true,
                decoration: const InputDecoration(labelText: "Papel", border: OutlineInputBorder()),
                items: const [
                  DropdownMenuItem(value: "signer", child: Text("Signatário", overflow: TextOverflow.ellipsis)),
                  DropdownMenuItem(value: "approver", child: Text("Aprovador", overflow: TextOverflow.ellipsis)),
                  DropdownMenuItem(value: "viewer", child: Text("Visualizador", overflow: TextOverflow.ellipsis)),
                ],
                onChanged: (value) {
                  if (value != null) form.role = value;
                },
              );
              final orderField = TextFormField(
                initialValue: form.order.toString(),
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: "Ordem", border: OutlineInputBorder()),
                onChanged: (value) => form.order = int.tryParse(value) ?? form.order,
              );

              if (compact) {
                return Column(
                  children: [
                    roleField,
                    const SizedBox(height: 10),
                    orderField,
                  ],
                );
              }

              return Row(
                children: [
                  Expanded(child: roleField),
                  const SizedBox(width: 10),
                  Expanded(child: orderField),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget child;

  const _SectionCard({
    required this.title,
    required this.subtitle,
    required this.child,
  });

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
          const SizedBox(height: 4),
          Text(subtitle, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }
}

class _MessageCard extends StatelessWidget {
  final Color color;
  final Color background;
  final String title;
  final String message;

  const _MessageCard({
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
