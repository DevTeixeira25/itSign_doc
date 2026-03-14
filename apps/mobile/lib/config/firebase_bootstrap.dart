import "package:firebase_core/firebase_core.dart";

class FirebaseBootstrapState {
  static String? lastError;

  static bool get isAvailable => lastError == null;
}

Future<void> initializeFirebase() async {
  try {
    await Firebase.initializeApp();
    FirebaseBootstrapState.lastError = null;
  } on UnsupportedError {
    rethrow;
  } catch (error) {
    FirebaseBootstrapState.lastError =
      "Firebase nao foi inicializado. Gere as plataformas com 'flutter create .', "
      "adicione google-services.json no Android e GoogleService-Info.plist no iOS, "
      "depois rode o app novamente. Erro original: $error";
  }
}
