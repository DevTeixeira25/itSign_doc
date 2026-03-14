import "dart:convert";
import "dart:io";

import "package:file_picker/file_picker.dart";
import "package:flutter/material.dart";
import "package:signature/signature.dart";
import "package:url_launcher/url_launcher.dart";

import "../services/api_service.dart";
import "../services/auth_service.dart";
import "../widgets/mobile_pdf_overlay_editor.dart";
import "../widgets/mobile_shell.dart";
import "../widgets/pdf_form_fields_editor.dart";

enum _SelfSignStep { upload, place, fill, sign, done }

class SelfSignScreen extends StatefulWidget {
  const SelfSignScreen({super.key});

  @override
  State<SelfSignScreen> createState() => _SelfSignScreenState();
}

class _SelfSignScreenState extends State<SelfSignScreen> {
  final _titleCtrl = TextEditingController();
  final _typedNameCtrl = TextEditingController();
  final _certPasswordCtrl = TextEditingController();
  final SignatureController _signatureCtrl = SignatureController(
    penStrokeWidth: 3,
    penColor: Colors.black,
    exportBackgroundColor: Colors.white,
  );

  File? _documentFile;
  File? _certificateFile;
  Map<String, dynamic>? _preparedDocument;
  Map<String, dynamic>? _user;
  Map<String, dynamic>? _doneResult;
  List<PdfFormFieldDefinition> _formFields = const [];
  Map<String, Object> _formValues = <String, Object>{};
  MobileSignatureField? _signatureField;
  List<MobileOverlayField> _overlayFields = const [];
  String? _selectedOverlayId;
  bool _loading = false;
  bool _preparingDocument = false;
  bool _acceptedTerms = false;
  String? _error;
  String? _prepareError;
  String? _signatureData;
  String _signMethod = "electronic";
  String _electronicMode = "draw";
  int _focusedPage = 1;
  _SelfSignStep _step = _SelfSignStep.upload;
  MobileFillTool _activeTool = MobileFillTool.signature;

  bool get _hasDocument => _documentFile != null;
  bool get _hasManualTextFields => _overlayFields.any((field) => field.type == MobileOverlayType.text);
  bool get _allManualTextFieldsFilled => _overlayFields
      .where((field) => field.type == MobileOverlayType.text)
      .every((field) => (field.value ?? "").trim().isNotEmpty);

  @override
  void initState() {
    super.initState();
    _loadUser();
  }

  Future<void> _loadUser() async {
    final user = await AuthService.getUser();
    if (!mounted) return;
    setState(() {
      _user = user;
      _typedNameCtrl.text = user?["name"]?.toString() ?? "";
    });
  }

  Future<void> _pickDocument() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ["pdf"],
    );
    if (result == null || result.files.single.path == null) return;
    final file = File(result.files.single.path!);
    setState(() {
      _documentFile = file;
      _preparedDocument = null;
      _formFields = const [];
      _formValues = <String, Object>{};
      _signatureField = null;
      _overlayFields = const [];
      _selectedOverlayId = null;
      _signatureData = null;
      _acceptedTerms = false;
      _prepareError = null;
      _error = null;
      _doneResult = null;
      _step = _SelfSignStep.upload;
      _activeTool = MobileFillTool.signature;
      _focusedPage = 1;
      if (_titleCtrl.text.trim().isEmpty) {
        _titleCtrl.text = result.files.single.name.replaceAll(RegExp(r"\.pdf$", caseSensitive: false), "");
      }
    });
    await _prepareDocument();
  }

  Future<void> _prepareDocument() async {
    if (_documentFile == null || _preparingDocument) return;

    setState(() {
      _preparingDocument = true;
      _prepareError = null;
      _error = null;
    });

    try {
      final uploaded = await ApiService.uploadDocument(_documentFile!);
      final fields = await ApiService.getDocumentFormFields(uploaded["id"].toString());
      final parsedFields = fields.map(PdfFormFieldDefinition.fromJson).toList();
      if (!mounted) return;
      setState(() {
        _preparedDocument = uploaded;
        _formFields = parsedFields;
        _formValues = {
          for (final field in parsedFields)
            if (field.value != null) field.name: field.value!,
        };
        _step = _SelfSignStep.place;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _prepareError = e.toString().replaceFirst("Exception: ", ""));
    } finally {
      if (mounted) {
        setState(() => _preparingDocument = false);
      }
    }
  }

  Future<void> _pickCertificate() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ["pfx", "p12"],
    );
    if (result == null || result.files.single.path == null) return;
    setState(() => _certificateFile = File(result.files.single.path!));
  }

  void _confirmPlacement() {
    if (_signatureField == null) {
      setState(() => _error = "Posicione o campo de assinatura no PDF.");
      return;
    }
    setState(() {
      _error = null;
      _step = _hasManualTextFields ? _SelfSignStep.fill : _SelfSignStep.sign;
    });
  }

  void _goToSignStep() {
    if (!_allManualTextFieldsFilled) {
      setState(() => _error = "Preencha todos os campos de texto antes de seguir.");
      return;
    }
    setState(() {
      _error = null;
      _step = _SelfSignStep.sign;
    });
  }

  void _removeSelectedOverlay() {
    if (_selectedOverlayId == null) return;
    setState(() {
      _overlayFields = _overlayFields.where((field) => field.id != _selectedOverlayId).toList(growable: false);
      _selectedOverlayId = null;
    });
  }

  void _updateSelectedSize({double? width, double? height}) {
    if (_selectedOverlayId != null) {
      setState(() {
        _overlayFields = [
          for (final field in _overlayFields)
            if (field.id == _selectedOverlayId)
              field.copyWith(width: width ?? field.width, height: height ?? field.height)
            else
              field,
        ];
      });
      return;
    }
    if (_signatureField != null) {
      setState(() {
        _signatureField = _signatureField!.copyWith(
          width: width ?? _signatureField!.width,
          height: height ?? _signatureField!.height,
        );
      });
    }
  }

  MobileOverlayField? get _selectedOverlay {
    final id = _selectedOverlayId;
    if (id == null) return null;
    for (final field in _overlayFields) {
      if (field.id == id) return field;
    }
    return null;
  }

  Future<void> _captureElectronicSignature() async {
    if (_electronicMode == "draw") {
      if (_signatureCtrl.isEmpty) throw Exception("Desenhe sua assinatura.");
      final bytes = await _signatureCtrl.toPngBytes();
      if (bytes == null) throw Exception("Falha ao capturar a assinatura.");
      _signatureData = base64Encode(bytes);
      return;
    }

    if (_typedNameCtrl.text.trim().isEmpty) {
      throw Exception("Digite o nome da assinatura.");
    }
    _signatureData = _typedNameCtrl.text.trim();
  }

  Future<void> _runSelfSign() async {
    setState(() {
      _loading = true;
      _error = null;
      _doneResult = null;
    });
    try {
      final user = _user ?? await AuthService.getUser();
      if (user == null) throw Exception("Sessão local indisponível.");
      if (_documentFile == null) throw Exception("Selecione um PDF.");
      if (_titleCtrl.text.trim().isEmpty) throw Exception("Informe o título do documento.");
      if (_preparedDocument == null) await _prepareDocument();
      if (_preparedDocument == null) throw Exception(_prepareError ?? "Não foi possível preparar o PDF.");
      if (_signatureField == null) throw Exception("Posicione a assinatura no documento.");
      if (!_allManualTextFieldsFilled) throw Exception("Preencha todos os campos de texto antes de assinar.");

      final envelope = await ApiService.createEnvelope(
        title: _titleCtrl.text.trim(),
        documentId: _preparedDocument!["id"].toString(),
        recipients: [
          {
            "name": user["name"]?.toString() ?? "Usuário",
            "email": user["email"]?.toString() ?? "",
            "role": "signer",
            "signingOrder": 1,
          }
        ],
      );
      final recipientToken = (envelope["recipients"] as List<dynamic>).first["accessToken"].toString();

      Map<String, dynamic> signResult;
      if (_signMethod == "electronic") {
        await _captureElectronicSignature();
        if (!_acceptedTerms) throw Exception("Aceite os termos para concluir a assinatura eletrônica.");
        signResult = await ApiService.sign(
          recipientToken,
          signatureData: _signatureData!,
          signatureType: _electronicMode,
          signaturePosition: _signatureField!.toJson(),
          formFields: _normalizedFormValues(),
          overlayFields: _normalizedOverlayFields(),
        );
      } else if (_signMethod == "certificate") {
        if (_certificateFile == null) throw Exception("Selecione o certificado .pfx/.p12.");
        if (_certPasswordCtrl.text.isEmpty) throw Exception("Informe a senha do certificado.");
        signResult = await ApiService.signWithCertificate(
          certificateFile: _certificateFile!,
          password: _certPasswordCtrl.text,
          recipientToken: recipientToken,
          envelopeId: envelope["id"].toString(),
          signaturePosition: _signatureField!.toJson(),
          formFields: _normalizedFormValues(),
          overlayFields: _normalizedOverlayFields(),
        );
      } else {
        try {
          signResult = await ApiService.govbrQuickSign(
            recipientToken: recipientToken,
            formFields: _normalizedFormValues(),
            overlayFields: _normalizedOverlayFields(),
          );
        } catch (_) {
          final auth = await ApiService.govbrAuthorize(
            envelopeId: envelope["id"].toString(),
            recipientToken: recipientToken,
            documentTitle: _titleCtrl.text.trim(),
            returnPath: "/self-sign",
          );
          final uri = Uri.parse(auth["authUrl"].toString());
          if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
            throw Exception("Não foi possível abrir o fluxo Gov.br.");
          }
          throw Exception(
            "Fluxo Gov.br iniciado no navegador. O callback mobile ainda depende de deep link; finalize no web por enquanto.",
          );
        }
      }

      await ApiService.sendEnvelope(envelope["id"].toString());
      String? verificationCode;
      try {
        final verification = await ApiService.getEnvelopeVerification(envelope["id"].toString());
        verificationCode = verification["verificationCode"]?.toString();
      } catch (_) {
        verificationCode = signResult["verificationCode"]?.toString();
      }

      if (!mounted) return;
      setState(() {
        _doneResult = {
          "title": _titleCtrl.text.trim(),
          "envelopeId": envelope["id"].toString(),
          "verificationCode": verificationCode,
          "signResult": signResult,
        };
        _step = _SelfSignStep.done;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst("Exception: ", ""));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return MobileShell(
      title: "Autoassinar",
      currentRoute: "/self-sign",
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _StepHeader(step: _step),
          const SizedBox(height: 16),
          _Panel(
            title: "Documento",
            subtitle: _step == _SelfSignStep.upload
                ? "Envie o PDF para começar. Depois você posiciona, preenche e assina."
                : "Documento carregado e pronto para edição.",
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    OutlinedButton.icon(
                      onPressed: _loading ? null : _pickDocument,
                      icon: const Icon(Icons.upload_file_outlined),
                      label: Text(_documentFile == null ? "Selecionar PDF" : "Trocar arquivo"),
                    ),
                    if (_preparedDocument != null)
                      const Chip(
                        avatar: Icon(Icons.check_circle, size: 18, color: Color(0xFF16A34A)),
                        label: Text("PDF preparado"),
                      ),
                    if (_hasDocument)
                      Chip(
                        avatar: const Icon(Icons.picture_as_pdf_outlined, size: 18),
                        label: Text(_documentFile!.uri.pathSegments.last),
                      ),
                  ],
                ),
                if (_preparingDocument) ...[
                  const SizedBox(height: 14),
                  const Row(
                    children: [
                      SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                      SizedBox(width: 10),
                      Expanded(child: Text("Analisando campos preenchíveis do PDF...")),
                    ],
                  ),
                ] else if (_prepareError != null) ...[
                  const SizedBox(height: 14),
                  Text(
                    _prepareError!,
                    style: const TextStyle(color: Color(0xFFDC2626), fontWeight: FontWeight.w600),
                  ),
                ],
                const SizedBox(height: 16),
                TextField(
                  controller: _titleCtrl,
                  decoration: const InputDecoration(labelText: "Título", border: OutlineInputBorder()),
                ),
              ],
            ),
          ),
          if (_hasDocument && _preparedDocument != null) ...[
            const SizedBox(height: 16),
            if (_step == _SelfSignStep.place) _buildPlacementPanel(theme),
            if (_step == _SelfSignStep.fill) _buildFillPanel(),
            if (_step == _SelfSignStep.sign) _buildSignPanel(),
            const SizedBox(height: 16),
            _Panel(
              title: "Documento em edição",
              subtitle: _step == _SelfSignStep.place
                  ? "Toque no PDF para inserir. Arraste pela alça superior e redimensione pelo canto."
                  : _step == _SelfSignStep.fill
                      ? "Preencha os textos direto no documento. Você ainda pode mover e redimensionar tudo."
                      : "Revise o documento final antes de concluir a assinatura.",
              child: MobilePdfOverlayEditor(
                file: _documentFile!,
                mode: _step == _SelfSignStep.place
                    ? MobilePdfEditMode.place
                    : _step == _SelfSignStep.fill
                        ? MobilePdfEditMode.fill
                        : MobilePdfEditMode.sign,
                activeTool: _activeTool,
                signatureField: _signatureField,
                overlayFields: _overlayFields,
                selectedOverlayId: _selectedOverlayId,
                signatureDataUrl: _signatureData,
                onPageFocused: (page) => setState(() => _focusedPage = page),
                onSignatureChanged: (field) => setState(() => _signatureField = field),
                onOverlayFieldsChanged: (fields) => setState(() => _overlayFields = fields),
                onSelectOverlay: (id) => setState(() => _selectedOverlayId = id),
              ),
            ),
          ] else ...[
            const SizedBox(height: 16),
            const _PendingStepCard(
              title: "Envie um PDF para liberar a edição",
              message: "Depois do upload, o app mostra as ferramentas de texto, assinatura, visto, X e ponto diretamente sobre o documento.",
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 16),
            _FeedbackCard(
              background: const Color(0xFFFEF2F2),
              color: const Color(0xFFDC2626),
              title: "Falha na assinatura",
              message: _error!,
            ),
          ],
          if (_doneResult != null) ...[
            const SizedBox(height: 16),
            _FeedbackCard(
              background: const Color(0xFFECFDF5),
              color: const Color(0xFF16A34A),
              title: "Documento assinado",
              message:
                  "Envelope ${_doneResult!["envelopeId"]} concluído. Código de verificação: ${_doneResult!["verificationCode"] ?? "indisponível"}",
            ),
          ],
          const SizedBox(height: 28),
        ],
      ),
    );
  }

  Widget _buildPlacementPanel(ThemeData theme) {
    final selected = _selectedOverlay;
    return _Panel(
      title: "Posicionar campos",
      subtitle: "Ferramentas manuais no estilo Adobe. Página ativa: $_focusedPage.",
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _ToolButton(
                active: _activeTool == MobileFillTool.text,
                icon: "A",
                onTap: () => setState(() => _activeTool = MobileFillTool.text),
              ),
              _ToolButton(
                active: _activeTool == MobileFillTool.signature,
                icon: "✍",
                onTap: () => setState(() => _activeTool = MobileFillTool.signature),
              ),
              _ToolButton(
                active: _activeTool == MobileFillTool.check,
                icon: "✓",
                onTap: () => setState(() => _activeTool = MobileFillTool.check),
              ),
              _ToolButton(
                active: _activeTool == MobileFillTool.cross,
                icon: "X",
                onTap: () => setState(() => _activeTool = MobileFillTool.cross),
              ),
              _ToolButton(
                active: _activeTool == MobileFillTool.dot,
                icon: "•",
                onTap: () => setState(() => _activeTool = MobileFillTool.dot),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              Chip(
                label: Text(_signatureField == null ? "Posicione a assinatura" : "Assinatura na pág. ${_signatureField!.page}"),
                avatar: Icon(
                  _signatureField == null ? Icons.error_outline : Icons.check_circle,
                  size: 18,
                  color: _signatureField == null ? const Color(0xFFDC2626) : const Color(0xFF16A34A),
                ),
              ),
              if (_overlayFields.isNotEmpty)
                Chip(
                  avatar: const Icon(Icons.layers_outlined, size: 18),
                  label: Text("${_overlayFields.length} marcação(ões)"),
                ),
            ],
          ),
          if (_signatureField != null || _overlayFields.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text("Itens inseridos", style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (_signatureField != null)
                  _ItemChip(
                    active: _selectedOverlayId == null,
                    label: "Assinatura · Pág. ${_signatureField!.page}",
                    onTap: () => setState(() => _selectedOverlayId = null),
                  ),
                for (var i = 0; i < _overlayFields.length; i++)
                  _ItemChip(
                    active: _selectedOverlayId == _overlayFields[i].id,
                    label: "${_overlayFields[i].label} ${i + 1} · Pág. ${_overlayFields[i].page}",
                    onTap: () => setState(() => _selectedOverlayId = _overlayFields[i].id),
                  ),
              ],
            ),
          ],
          if (_signatureField != null || selected != null) ...[
            const SizedBox(height: 16),
            Text("Tamanho do item selecionado", style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
            Slider(
              value: (selected?.width ?? _signatureField?.width ?? 25).clamp(3, 80).toDouble(),
              min: selected == null ? 8 : (selected.type == MobileOverlayType.text ? 12 : 3.2),
              max: selected == null ? 60 : (selected.type == MobileOverlayType.text ? 80 : 18),
              onChanged: (value) => _updateSelectedSize(width: value),
            ),
            Slider(
              value: (selected?.height ?? _signatureField?.height ?? 8).clamp(3, 25).toDouble(),
              min: selected == null ? 3 : (selected.type == MobileOverlayType.text ? 4.2 : 3.2),
              max: selected == null ? 25 : (selected.type == MobileOverlayType.text ? 20 : 18),
              onChanged: (value) => _updateSelectedSize(height: value),
            ),
            if (_selectedOverlayId != null)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: _removeSelectedOverlay,
                  icon: const Icon(Icons.delete_outline),
                  label: const Text("Remover marcação selecionada"),
                ),
              ),
          ],
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _loading ? null : _confirmPlacement,
              child: const Text("Próximo: conferir e assinar"),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFillPanel() {
    return _Panel(
      title: "Preencher campos",
      subtitle: "Edite os textos direto no PDF. O próximo passo só libera quando todos os campos estiverem preenchidos.",
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              Chip(
                avatar: const Icon(Icons.text_fields, size: 18),
                label: Text("${_overlayFields.where((field) => field.type == MobileOverlayType.text).length} campo(s) de texto"),
              ),
              Chip(
                avatar: Icon(
                  _allManualTextFieldsFilled ? Icons.check_circle : Icons.pending_outlined,
                  size: 18,
                  color: _allManualTextFieldsFilled ? const Color(0xFF16A34A) : const Color(0xFFF59E0B),
                ),
                label: Text(_allManualTextFieldsFilled ? "Tudo preenchido" : "Há campos pendentes"),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _loading || !_allManualTextFieldsFilled ? null : _goToSignStep,
              child: const Text("Próximo: assinar"),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: _loading ? null : () => setState(() => _step = _SelfSignStep.place),
              child: const Text("Voltar ao posicionamento"),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSignPanel() {
    return _Panel(
      title: "Assinar",
      subtitle: "Os campos continuam movíveis e redimensionáveis até a conclusão.",
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_formFields.isNotEmpty) ...[
            PdfFormFieldsEditor(
              fields: _formFields,
              values: _formValues,
              onChanged: (next) => setState(() => _formValues = next),
            ),
            const SizedBox(height: 16),
          ],
          DropdownButtonFormField<String>(
            key: ValueKey(_signMethod),
            initialValue: _signMethod,
            decoration: const InputDecoration(
              labelText: "Modelo de assinatura",
              border: OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: "electronic", child: Text("Eletrônica")),
              DropdownMenuItem(value: "certificate", child: Text("Certificado Digital")),
              DropdownMenuItem(value: "govbr", child: Text("Gov.br")),
            ],
            onChanged: _loading ? null : (value) => setState(() => _signMethod = value ?? "electronic"),
          ),
          const SizedBox(height: 16),
          if (_signMethod == "electronic") ...[
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: "draw", label: Text("Desenhar")),
                ButtonSegment(value: "type", label: Text("Digitar")),
              ],
              selected: {_electronicMode},
              onSelectionChanged: (selection) => setState(() {
                _electronicMode = selection.first;
                _signatureData = null;
              }),
            ),
            const SizedBox(height: 16),
            if (_electronicMode == "draw")
              Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: const Color(0xFFCBD5E1)),
                ),
                child: Column(
                  children: [
                    Signature(
                      controller: _signatureCtrl,
                      height: 180,
                      backgroundColor: Colors.white,
                    ),
                    const Divider(height: 1),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton.icon(
                        onPressed: () {
                          _signatureCtrl.clear();
                          setState(() => _signatureData = null);
                        },
                        icon: const Icon(Icons.refresh),
                        label: const Text("Limpar"),
                      ),
                    ),
                  ],
                ),
              )
            else
              TextField(
                controller: _typedNameCtrl,
                decoration: const InputDecoration(
                  labelText: "Nome da assinatura",
                  border: OutlineInputBorder(),
                ),
              ),
            const SizedBox(height: 16),
            CheckboxListTile(
              value: _acceptedTerms,
              contentPadding: EdgeInsets.zero,
              onChanged: _loading ? null : (value) => setState(() => _acceptedTerms = value ?? false),
              title: const Text(
                "Declaro que concordo em assinar eletronicamente este documento com validade jurídica.",
                style: TextStyle(fontSize: 13),
              ),
            ),
          ] else if (_signMethod == "certificate") ...[
            OutlinedButton.icon(
              onPressed: _loading ? null : _pickCertificate,
              icon: const Icon(Icons.badge_outlined),
              label: Text(_certificateFile == null ? "Selecionar certificado" : "Trocar certificado"),
            ),
            if (_certificateFile != null) ...[
              const SizedBox(height: 10),
              Text(_certificateFile!.uri.pathSegments.last, style: const TextStyle(fontWeight: FontWeight.w700)),
            ],
            const SizedBox(height: 16),
            TextField(
              controller: _certPasswordCtrl,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: "Senha do certificado",
                border: OutlineInputBorder(),
              ),
            ),
          ] else ...[
            const _GovBrInfo(),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _loading ? null : _runSelfSign,
              icon: _loading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.check_circle_outline),
              label: Text(_loading ? "Processando..." : "Concluir assinatura"),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: _loading
                  ? null
                  : () => setState(() => _step = _hasManualTextFields ? _SelfSignStep.fill : _SelfSignStep.place),
              child: const Text("Voltar"),
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _typedNameCtrl.dispose();
    _certPasswordCtrl.dispose();
    _signatureCtrl.dispose();
    super.dispose();
  }

  Map<String, dynamic> _normalizedFormValues() {
    final result = <String, dynamic>{};
    for (final entry in _formValues.entries) {
      final value = entry.value;
      if (value is String && value.trim().isEmpty) continue;
      if (value is List && value.isEmpty) continue;
      result[entry.key] = value;
    }
    return result;
  }

  List<Map<String, dynamic>> _normalizedOverlayFields() {
    return _overlayFields.map((field) => field.toJson()).toList(growable: false);
  }
}

class _StepHeader extends StatelessWidget {
  final _SelfSignStep step;

  const _StepHeader({required this.step});

  @override
  Widget build(BuildContext context) {
    final currentIndex = switch (step) {
      _SelfSignStep.upload => 0,
      _SelfSignStep.place => 1,
      _SelfSignStep.fill => 2,
      _SelfSignStep.sign => 3,
      _SelfSignStep.done => 4,
    };

    const labels = [
      "Documento",
      "Posicionar",
      "Preencher",
      "Assinar",
      "Concluído",
    ];

    return SizedBox(
      height: 56,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: labels.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final active = index == currentIndex;
          final completed = index < currentIndex;
          final scheme = Theme.of(context).colorScheme;
          final background = active
              ? scheme.primary
              : completed
                  ? const Color(0xFFDCFCE7)
                  : scheme.surfaceContainerHigh;
          final foreground = active
              ? scheme.onPrimary
              : completed
                  ? const Color(0xFF166534)
                  : scheme.onSurfaceVariant;
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: background,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: active ? scheme.primary : scheme.outlineVariant),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 12,
                  backgroundColor: foreground.withValues(alpha: active ? 0.18 : 0.12),
                  child: Text(
                    "${index + 1}",
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: foreground),
                  ),
                ),
                const SizedBox(width: 8),
                Text(labels[index], style: TextStyle(color: foreground, fontWeight: FontWeight.w700)),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget child;

  const _Panel({
    required this.title,
    required this.subtitle,
    required this.child,
  });

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
          const SizedBox(height: 4),
          Text(subtitle, style: TextStyle(color: scheme.onSurfaceVariant)),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }
}

class _PendingStepCard extends StatelessWidget {
  final String title;
  final String message;

  const _PendingStepCard({
    required this.title,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.lock_outline, color: scheme.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(message, style: TextStyle(color: scheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

class _FeedbackCard extends StatelessWidget {
  final Color background;
  final Color color;
  final String title;
  final String message;

  const _FeedbackCard({
    required this.background,
    required this.color,
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
        border: Border.all(color: color.withValues(alpha: 0.2)),
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

class _ToolButton extends StatelessWidget {
  final bool active;
  final String icon;
  final VoidCallback onTap;

  const _ToolButton({
    required this.active,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Ink(
        width: 54,
        height: 54,
        decoration: BoxDecoration(
          color: active ? scheme.primary : scheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: active ? scheme.primary : scheme.outlineVariant),
          boxShadow: active
              ? [
                  BoxShadow(
                    color: scheme.primary.withValues(alpha: 0.22),
                    blurRadius: 16,
                    offset: const Offset(0, 6),
                  ),
                ]
              : null,
        ),
        child: Center(
          child: Text(
            icon,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: active ? scheme.onPrimary : scheme.onSurface,
            ),
          ),
        ),
      ),
    );
  }
}

class _ItemChip extends StatelessWidget {
  final bool active;
  final String label;
  final VoidCallback onTap;

  const _ItemChip({
    required this.active,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ActionChip(
      onPressed: onTap,
      backgroundColor: active ? scheme.primaryContainer : scheme.surfaceContainerHigh,
      side: BorderSide(color: active ? scheme.primary : scheme.outlineVariant),
      label: Text(
        label,
        style: TextStyle(
          color: active ? scheme.onPrimaryContainer : scheme.onSurfaceVariant,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _GovBrInfo extends StatelessWidget {
  const _GovBrInfo();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFFDE68A)),
      ),
      child: const Text(
        "O mobile já envia os campos manuais junto com o fluxo Gov.br. O callback completo dentro do app ainda depende de deep link/app link.",
        style: TextStyle(color: Color(0xFF92400E)),
      ),
    );
  }
}
