import "dart:convert";
import "dart:io";
import "dart:math" as math;
import "dart:typed_data";

import "package:flutter/material.dart";
import "package:pdf_render/pdf_render_widgets.dart";

enum MobileFillTool { signature, text, check, cross, dot }

enum MobilePdfEditMode { place, fill, sign }

enum MobileOverlayType { text, check, cross, dot }

class MobileSignatureField {
  final int page;
  final double x;
  final double y;
  final double width;
  final double height;

  const MobileSignatureField({
    required this.page,
    required this.x,
    required this.y,
    required this.width,
    required this.height,
  });

  MobileSignatureField copyWith({
    int? page,
    double? x,
    double? y,
    double? width,
    double? height,
  }) {
    return MobileSignatureField(
      page: page ?? this.page,
      x: x ?? this.x,
      y: y ?? this.y,
      width: width ?? this.width,
      height: height ?? this.height,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      "page": page,
      "x": x,
      "y": y,
      "width": width,
      "height": height,
    };
  }
}

class MobileOverlayField {
  final String id;
  final MobileOverlayType type;
  final int page;
  final double x;
  final double y;
  final double width;
  final double height;
  final String? value;

  const MobileOverlayField({
    required this.id,
    required this.type,
    required this.page,
    required this.x,
    required this.y,
    required this.width,
    required this.height,
    this.value,
  });

  MobileOverlayField copyWith({
    String? id,
    MobileOverlayType? type,
    int? page,
    double? x,
    double? y,
    double? width,
    double? height,
    String? value,
    bool clearValue = false,
  }) {
    return MobileOverlayField(
      id: id ?? this.id,
      type: type ?? this.type,
      page: page ?? this.page,
      x: x ?? this.x,
      y: y ?? this.y,
      width: width ?? this.width,
      height: height ?? this.height,
      value: clearValue ? null : (value ?? this.value),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      "id": id,
      "type": type.name,
      "page": page,
      "x": x,
      "y": y,
      "width": width,
      "height": height,
      if (value != null) "value": value,
    };
  }

  String get icon {
    switch (type) {
      case MobileOverlayType.text:
        return "A";
      case MobileOverlayType.check:
        return "✓";
      case MobileOverlayType.cross:
        return "X";
      case MobileOverlayType.dot:
        return "•";
    }
  }

  String get label {
    switch (type) {
      case MobileOverlayType.text:
        return "Texto";
      case MobileOverlayType.check:
        return "Visto";
      case MobileOverlayType.cross:
        return "X";
      case MobileOverlayType.dot:
        return "Ponto";
    }
  }
}

class MobilePdfOverlayEditor extends StatelessWidget {
  final File file;
  final MobilePdfEditMode mode;
  final MobileFillTool activeTool;
  final MobileSignatureField? signatureField;
  final List<MobileOverlayField> overlayFields;
  final String? selectedOverlayId;
  final String? signatureDataUrl;
  final ValueChanged<int>? onPageFocused;
  final ValueChanged<MobileSignatureField> onSignatureChanged;
  final ValueChanged<List<MobileOverlayField>> onOverlayFieldsChanged;
  final ValueChanged<String?> onSelectOverlay;

  const MobilePdfOverlayEditor({
    super.key,
    required this.file,
    required this.mode,
    required this.activeTool,
    required this.signatureField,
    required this.overlayFields,
    required this.selectedOverlayId,
    required this.signatureDataUrl,
    required this.onSignatureChanged,
    required this.onOverlayFieldsChanged,
    required this.onSelectOverlay,
    this.onPageFocused,
  });

  @override
  Widget build(BuildContext context) {
    return PdfDocumentLoader.openFile(
      file.path,
      documentBuilder: (context, pdfDocument, pageCount) {
        return ListView.separated(
          itemCount: pageCount,
          physics: const NeverScrollableScrollPhysics(),
          shrinkWrap: true,
          separatorBuilder: (_, __) => const SizedBox(height: 18),
          itemBuilder: (context, index) {
            final pageNumber = index + 1;
            return Container(
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerLowest,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
              ),
              padding: const EdgeInsets.all(12),
              child: Column(
                children: [
                  _PageBadge(pageNumber: pageNumber),
                  const SizedBox(height: 10),
                  PdfPageView(
                    pdfDocument: pdfDocument,
                    pageNumber: pageNumber,
                    pageBuilder: (context, textureBuilder, pageSize) {
                      return LayoutBuilder(
                        builder: (context, constraints) {
                          final width = math.min(constraints.maxWidth, 900.0);
                          final height = width * (pageSize.height / pageSize.width);
                          return SizedBox(
                            width: width,
                            height: height,
                            child: GestureDetector(
                              onTapUp: mode == MobilePdfEditMode.place
                                  ? (details) {
                                      onPageFocused?.call(pageNumber);
                                      _handleTap(pageNumber, width, height, details.localPosition);
                                    }
                                  : null,
                              child: Stack(
                                children: [
                                  Positioned.fill(
                                    child: ClipRRect(
                                      borderRadius: BorderRadius.circular(18),
                                      child: DecoratedBox(
                                        decoration: BoxDecoration(
                                          color: Colors.white,
                                          border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
                                          borderRadius: BorderRadius.circular(18),
                                          boxShadow: const [
                                            BoxShadow(
                                              color: Color(0x140F172A),
                                              blurRadius: 16,
                                              offset: Offset(0, 10),
                                            ),
                                          ],
                                        ),
                                        child: textureBuilder(
                                          size: Size(width, height),
                                          backgroundFill: true,
                                        ),
                                      ),
                                    ),
                                  ),
                                  if (signatureField?.page == pageNumber)
                                    _SignatureOverlay(
                                      field: signatureField!,
                                      pageSize: Size(width, height),
                                      selected: selectedOverlayId == null,
                                      signed: mode == MobilePdfEditMode.sign && signatureDataUrl != null,
                                      signatureDataUrl: signatureDataUrl,
                                      onFocus: () {
                                        onPageFocused?.call(pageNumber);
                                        onSelectOverlay(null);
                                      },
                                      onMove: (dx, dy) {
                                        onPageFocused?.call(pageNumber);
                                        onSelectOverlay(null);
                                        onSignatureChanged(_moveSignature(signatureField!, dx, dy));
                                      },
                                      onResize: (dx, dy) {
                                        onPageFocused?.call(pageNumber);
                                        onSelectOverlay(null);
                                        onSignatureChanged(_resizeSignature(signatureField!, dx, dy));
                                      },
                                    ),
                                  ...overlayFields
                                      .where((field) => field.page == pageNumber)
                                      .map(
                                        (field) => _OverlayFieldBox(
                                          field: field,
                                          pageSize: Size(width, height),
                                          mode: mode,
                                          selected: selectedOverlayId == field.id,
                                          onFocus: () {
                                            onPageFocused?.call(pageNumber);
                                            onSelectOverlay(field.id);
                                          },
                                          onMove: (dx, dy) {
                                            onPageFocused?.call(pageNumber);
                                            onSelectOverlay(field.id);
                                            _patchField(field.id, _moveField(field, dx, dy));
                                          },
                                          onResize: (dx, dy) {
                                            onPageFocused?.call(pageNumber);
                                            onSelectOverlay(field.id);
                                            _patchField(field.id, _resizeField(field, dx, dy));
                                          },
                                          onTextChanged: mode == MobilePdfEditMode.fill && field.type == MobileOverlayType.text
                                              ? (value) => _patchField(field.id, field.copyWith(value: value))
                                              : null,
                                        ),
                                      ),
                                ],
                              ),
                            ),
                          );
                        },
                      );
                    },
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  void _handleTap(int pageNumber, double width, double height, Offset localPosition) {
    final x = (localPosition.dx / width) * 100;
    final y = (localPosition.dy / height) * 100;
    if (activeTool == MobileFillTool.signature) {
      onSelectOverlay(null);
      onSignatureChanged(
        MobileSignatureField(
          page: pageNumber,
          x: _clamp(x - 12.5, 0, 75),
          y: _clamp(y - 4, 0, 92),
          width: 25,
          height: 8,
        ),
      );
      return;
    }

    final nextField = _createOverlayField(activeTool, pageNumber, x, y);
    onOverlayFieldsChanged([...overlayFields, nextField]);
    onSelectOverlay(nextField.id);
  }

  MobileSignatureField _moveSignature(MobileSignatureField field, double dxPx, double dyPx) {
    return field.copyWith(
      x: _clamp(field.x + dxPx, 0, 100 - field.width),
      y: _clamp(field.y + dyPx, 0, 100 - field.height),
    );
  }

  MobileSignatureField _resizeSignature(MobileSignatureField field, double dxPx, double dyPx) {
    return field.copyWith(
      width: _clamp(field.width + dxPx, 8, 60),
      height: _clamp(field.height + dyPx, 3, 25),
    );
  }

  MobileOverlayField _moveField(MobileOverlayField field, double dxPx, double dyPx) {
    return field.copyWith(
      x: _clamp(field.x + dxPx, 0, 100 - field.width),
      y: _clamp(field.y + dyPx, 0, 100 - field.height),
    );
  }

  MobileOverlayField _resizeField(MobileOverlayField field, double dxPx, double dyPx) {
    final minWidth = field.type == MobileOverlayType.text ? 12.0 : 3.2;
    final minHeight = field.type == MobileOverlayType.text ? 4.2 : 3.2;
    final maxWidth = field.type == MobileOverlayType.text ? 80.0 : 18.0;
    final maxHeight = field.type == MobileOverlayType.text ? 20.0 : 18.0;
    return field.copyWith(
      width: _clamp(field.width + dxPx, minWidth, maxWidth),
      height: _clamp(field.height + dyPx, minHeight, maxHeight),
    );
  }

  void _patchField(String id, MobileOverlayField next) {
    onOverlayFieldsChanged([
      for (final field in overlayFields) if (field.id == id) next else field,
    ]);
  }

  static MobileOverlayField _createOverlayField(
    MobileFillTool tool,
    int page,
    double x,
    double y,
  ) {
    final id = "${tool.name}-${DateTime.now().microsecondsSinceEpoch}";
    if (tool == MobileFillTool.text) {
      return MobileOverlayField(
        id: id,
        type: MobileOverlayType.text,
        page: page,
        x: _clamp(x - 12, 0, 72),
        y: _clamp(y - 2.8, 0, 94),
        width: 24,
        height: 5.5,
        value: "",
      );
    }

    final type = switch (tool) {
      MobileFillTool.check => MobileOverlayType.check,
      MobileFillTool.cross => MobileOverlayType.cross,
      MobileFillTool.dot => MobileOverlayType.dot,
      _ => MobileOverlayType.text,
    };

    return MobileOverlayField(
      id: id,
      type: type,
      page: page,
      x: _clamp(x - 2.5, 0, 95),
      y: _clamp(y - 2.5, 0, 95),
      width: 5,
      height: 5,
      value: type == MobileOverlayType.dot ? "." : null,
    );
  }

  static double _clamp(double value, double min, double max) {
    return math.min(math.max(value, min), max);
  }
}

class _PageBadge extends StatelessWidget {
  final int pageNumber;

  const _PageBadge({required this.pageNumber});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Text(
        "Página $pageNumber",
        style: TextStyle(
          color: scheme.onSurfaceVariant,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _SignatureOverlay extends StatelessWidget {
  final MobileSignatureField field;
  final Size pageSize;
  final bool selected;
  final bool signed;
  final String? signatureDataUrl;
  final VoidCallback onFocus;
  final void Function(double dxPercent, double dyPercent) onMove;
  final void Function(double dxPercent, double dyPercent) onResize;

  const _SignatureOverlay({
    required this.field,
    required this.pageSize,
    required this.selected,
    required this.signed,
    required this.signatureDataUrl,
    required this.onFocus,
    required this.onMove,
    required this.onResize,
  });

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: pageSize.width * field.x / 100,
      top: pageSize.height * field.y / 100,
      width: pageSize.width * field.width / 100,
      height: pageSize.height * field.height / 100,
        child: _OverlayShell(
        color: const Color(0xFF2563EB),
        selected: selected,
        dragEnabled: true,
        onFocus: onFocus,
        onMove: onMove,
        onResize: onResize,
        child: signed && signatureDataUrl != null
            ? ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.memory(
                  _decodeImageBytes(signatureDataUrl!),
                  fit: BoxFit.contain,
                ),
              )
            : const Center(
                child: Text(
                  "Assinatura",
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF1D4ED8),
                  ),
                ),
              ),
      ),
    );
  }

  Uint8List _decodeImageBytes(String raw) {
    if (raw.startsWith("data:")) {
      return UriData.parse(raw).contentAsBytes();
    }
    return base64Decode(raw);
  }
}

class _OverlayFieldBox extends StatelessWidget {
  final MobileOverlayField field;
  final Size pageSize;
  final MobilePdfEditMode mode;
  final bool selected;
  final VoidCallback onFocus;
  final void Function(double dxPercent, double dyPercent) onMove;
  final void Function(double dxPercent, double dyPercent) onResize;
  final ValueChanged<String>? onTextChanged;

  const _OverlayFieldBox({
    required this.field,
    required this.pageSize,
    required this.mode,
    required this.selected,
    required this.onFocus,
    required this.onMove,
    required this.onResize,
    this.onTextChanged,
  });

  @override
  Widget build(BuildContext context) {
    final color = switch (field.type) {
      MobileOverlayType.text => const Color(0xFFF59E0B),
      MobileOverlayType.check => const Color(0xFF16A34A),
      MobileOverlayType.cross => const Color(0xFFDC2626),
      MobileOverlayType.dot => const Color(0xFF475569),
    };

    return Positioned(
      left: pageSize.width * field.x / 100,
      top: pageSize.height * field.y / 100,
      width: pageSize.width * field.width / 100,
      height: pageSize.height * field.height / 100,
      child: _OverlayShell(
        color: color,
        selected: selected,
        dragEnabled: mode != MobilePdfEditMode.fill || field.type != MobileOverlayType.text,
        onFocus: onFocus,
        onMove: onMove,
        onResize: onResize,
        child: field.type == MobileOverlayType.text && mode == MobilePdfEditMode.fill
            ? TextField(
                controller: TextEditingController(text: field.value ?? "")
                  ..selection = TextSelection.collapsed(offset: (field.value ?? "").length),
                onTap: onFocus,
                onChanged: onTextChanged,
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
                decoration: const InputDecoration(
                  isDense: true,
                  hintText: "Digite aqui",
                  border: InputBorder.none,
                  contentPadding: EdgeInsets.fromLTRB(8, 18, 20, 6),
                ),
              )
            : Center(
                child: Text(
                  field.type == MobileOverlayType.text ? ((field.value ?? "").trim().isEmpty ? "Texto" : field.value!.trim()) : field.icon,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: field.type == MobileOverlayType.text ? 11 : 18,
                    fontWeight: FontWeight.w700,
                    color: color,
                  ),
                ),
              ),
      ),
    );
  }
}

class _OverlayShell extends StatelessWidget {
  final Color color;
  final bool selected;
  final bool dragEnabled;
  final Widget child;
  final VoidCallback onFocus;
  final void Function(double dxPercent, double dyPercent) onMove;
  final void Function(double dxPercent, double dyPercent) onResize;

  const _OverlayShell({
    required this.color,
    required this.selected,
    required this.dragEnabled,
    required this.child,
    required this.onFocus,
    required this.onMove,
    required this.onResize,
  });

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color, width: selected ? 2 : 1.2),
        boxShadow: selected
            ? [
                BoxShadow(
                  color: color.withValues(alpha: 0.18),
                  blurRadius: 14,
                  offset: const Offset(0, 4),
                ),
              ]
            : null,
      ),
      child: Stack(
        children: [
          if (dragEnabled)
            Positioned.fill(
              child: GestureDetector(
                onTap: onFocus,
                onPanStart: (_) => onFocus(),
                onPanUpdate: (details) => onMove(details.delta.dx / (context.size!.width) * 100, details.delta.dy / (context.size!.height) * 100),
                child: const SizedBox.expand(),
              ),
            ),
          Positioned(
            top: 2,
            left: 2,
            right: 18,
            child: GestureDetector(
              onTap: onFocus,
              onPanStart: (_) => onFocus(),
              onPanUpdate: (details) => onMove(details.delta.dx / (context.size!.width) * 100, details.delta.dy / (context.size!.height) * 100),
              child: Align(
                alignment: Alignment.topLeft,
                child: Container(
                  width: 20,
                  height: 14,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Icon(Icons.drag_indicator, size: 12, color: color),
                ),
              ),
            ),
          ),
          Positioned.fill(child: child),
          Positioned(
            right: 1,
            bottom: 1,
            child: GestureDetector(
              onTap: onFocus,
              onPanStart: (_) => onFocus(),
              onPanUpdate: (details) => onResize(details.delta.dx / (context.size!.width) * 100, details.delta.dy / (context.size!.height) * 100),
              child: Container(
                width: 16,
                height: 16,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(8),
                    bottomRight: Radius.circular(8),
                  ),
                ),
                child: const Icon(Icons.open_in_full, size: 10, color: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
