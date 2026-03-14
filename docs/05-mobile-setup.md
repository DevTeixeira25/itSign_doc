# Mobile Setup

Estado atual do app mobile:

- o projeto tem a camada `lib/` pronta para evolucao
- as pastas de plataforma (`android/`, `ios/`, `macos/`, `web/`, `linux/`, `windows/`) ainda nao estao versionadas
- o backend atual usa Firebase ID Token, entao o mobile ainda nao tem login nativo final
- o `pubspec.yaml` ja foi preparado com `firebase_core` e `firebase_auth`

## 1. Gerar estrutura Flutter

No diretorio `apps/mobile`, gere os arquivos de plataforma:

```bash
flutter create .
```

Se voce usa Puro, garanta antes que o ambiente `itsign` exista e esteja ativo.

## 2. Instalar dependencias

```bash
cd apps/mobile
flutter pub get
```

Se precisar recriar os artefatos nativos depois do `flutter create .`, rode:

```bash
flutter pub get
flutter config --enable-ios
flutter config --enable-android
```

## 3. Configurar URL da API

O app agora aceita `dart-define` para a API:

```bash
flutter run --dart-define=ITSIGN_API_BASE_URL=http://10.0.2.2:3001
```

Exemplos:

- Android emulator: `http://10.0.2.2:3001`
- iOS simulator: `http://127.0.0.1:3001`
- dispositivo fisico: `http://SEU_IP_NA_REDE:3001`

Se voce nao passar `ITSIGN_API_BASE_URL`, o app usa defaults por plataforma:

- Android: `http://10.0.2.2:3001`
- iOS/macOS: `http://127.0.0.1:3001`
- fallback geral: `http://127.0.0.1:3001`

## 4. Bootstrap de autenticacao atual

Enquanto a integracao Flutter + Firebase nao for adicionada, o app usa um modo de bootstrap por token:

1. faca login no web app
2. obtenha um Firebase ID Token valido
3. cole o token na tela inicial do app mobile
4. o app chama `GET /v1/auth/me` para validar a sessao

## 5. Como obter o Firebase ID Token

No navegador com o web app autenticado, abra o console e execute:

```js
const { getAuth } = await import("firebase/auth");
await getAuth().currentUser.getIdToken()
```

Cole o valor retornado no app mobile.

## 6. Configuracao Firebase para Apple e Android

Depois de gerar `android/` e `ios/`, adicione os arquivos nativos do Firebase:

- Android: `apps/mobile/android/app/google-services.json`
- iOS: `apps/mobile/ios/Runner/GoogleService-Info.plist`

No Firebase Console, use o mesmo projeto do web/app atual:

- Project ID: `itsign-79d36`

Plataformas a registrar:

- Android app
- iOS app

## 7. Inicializacao no app

O `main.dart` ja foi preparado para chamar:

```dart
await Firebase.initializeApp();
```

Se os arquivos nativos ainda nao existirem, o app mostra uma mensagem explicita na splash screen em vez de falhar silenciosamente.

## 8. Proximo passo recomendado

Para o mobile ficar realmente pronto, o proximo incremento deve ser:

1. gerar as plataformas com `flutter create .`
2. adicionar `google-services.json` e `GoogleService-Info.plist`
3. trocar o bootstrap manual por login real com `firebase_auth`
4. sincronizar cadastro local via `POST /v1/auth/register` quando necessario
