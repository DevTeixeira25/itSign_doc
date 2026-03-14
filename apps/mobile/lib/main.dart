import "package:flutter/material.dart";
import "config/app_config.dart";
import "config/firebase_bootstrap.dart";
import "screens/create_envelope_screen.dart";
import "screens/login_screen.dart";
import "screens/dashboard_screen.dart";
import "screens/profile_screen.dart";
import "screens/self_sign_screen.dart";
import "screens/sign_screen.dart";
import "screens/verify_screen.dart";
import "services/auth_service.dart";

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeFirebase();
  runApp(const ITSignApp());
}

class ITSignApp extends StatefulWidget {
  const ITSignApp({super.key});

  static ITSignAppState of(BuildContext context) {
    final state = context.findAncestorStateOfType<ITSignAppState>();
    if (state == null) {
      throw StateError("ITSignApp state not found");
    }
    return state;
  }

  @override
  State<ITSignApp> createState() => ITSignAppState();
}

class ITSignAppState extends State<ITSignApp> {
  ThemeMode _themeMode = ThemeMode.light;

  @override
  void initState() {
    super.initState();
    _loadTheme();
  }

  Future<void> _loadTheme() async {
    final darkMode = await AuthService.getDarkMode();
    if (!mounted) return;
    setState(() {
      _themeMode = darkMode ? ThemeMode.dark : ThemeMode.light;
    });
  }

  Future<void> setDarkMode(bool enabled) async {
    await AuthService.setDarkMode(enabled);
    if (!mounted) return;
    setState(() {
      _themeMode = enabled ? ThemeMode.dark : ThemeMode.light;
    });
  }

  @override
  Widget build(BuildContext context) {
    const lightScheme = ColorScheme.light(
      primary: Color(0xFF2563EB),
      secondary: Color(0xFF0EA5E9),
      surface: Color(0xFFFFFFFF),
      onSurface: Color(0xFF0F172A),
      onPrimary: Color(0xFFFFFFFF),
      outline: Color(0xFFCBD5E1),
      outlineVariant: Color(0xFFD9E2F2),
      surfaceContainerLowest: Color(0xFFF4F7FB),
      surfaceContainerLow: Color(0xFFF8FAFC),
      surfaceContainerHighest: Color(0xFFEAF3FF),
      onSurfaceVariant: Color(0xFF64748B),
      error: Color(0xFFDC2626),
    );
    const darkScheme = ColorScheme.dark(
      primary: Color(0xFF60A5FA),
      secondary: Color(0xFF38BDF8),
      surface: Color(0xFF0F172A),
      onSurface: Color(0xFFE2E8F0),
      onPrimary: Color(0xFF020617),
      outline: Color(0xFF1E293B),
      outlineVariant: Color(0xFF1E3A8A),
      surfaceContainerLowest: Color(0xFF020617),
      surfaceContainerLow: Color(0xFF081122),
      surfaceContainerHighest: Color(0xFF111C34),
      onSurfaceVariant: Color(0xFF94A3B8),
      error: Color(0xFFF87171),
    );
    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: lightScheme,
        useMaterial3: true,
        brightness: Brightness.light,
        scaffoldBackgroundColor: lightScheme.surfaceContainerLowest,
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.transparent,
          foregroundColor: Color(0xFF0F172A),
          elevation: 0,
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: lightScheme.surface,
          indicatorColor: lightScheme.primary.withValues(alpha: 0.14),
          labelTextStyle: WidgetStatePropertyAll(
            TextStyle(color: lightScheme.onSurface, fontWeight: FontWeight.w600),
          ),
          iconTheme: WidgetStateProperty.resolveWith((states) {
            final selected = states.contains(WidgetState.selected);
            return IconThemeData(color: selected ? lightScheme.primary : lightScheme.onSurfaceVariant);
          }),
        ),
      ),
      darkTheme: ThemeData(
        brightness: Brightness.dark,
        useMaterial3: true,
        scaffoldBackgroundColor: darkScheme.surfaceContainerLowest,
        colorScheme: darkScheme,
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF020617),
          foregroundColor: Color(0xFFE2E8F0),
          elevation: 0,
        ),
        cardTheme: CardThemeData(
          color: const Color(0xFF0F172A),
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFF111827),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: Color(0xFF1E3A8A)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: Color(0xFF1E3A8A)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: Color(0xFF60A5FA), width: 1.4),
          ),
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: const Color(0xFF081122),
          indicatorColor: const Color(0xFF1E3A8A),
          labelTextStyle: const WidgetStatePropertyAll(
            TextStyle(color: Color(0xFFE2E8F0), fontWeight: FontWeight.w600),
          ),
          iconTheme: WidgetStateProperty.resolveWith((states) {
            final selected = states.contains(WidgetState.selected);
            return IconThemeData(color: selected ? darkScheme.primary : darkScheme.onSurfaceVariant);
          }),
        ),
      ),
      themeMode: _themeMode,
      initialRoute: "/",
      routes: {
        "/": (context) => const SplashScreen(),
        "/login": (context) => const LoginScreen(),
        "/dashboard": (context) => const DashboardScreen(),
        "/envelopes/new": (context) => const CreateEnvelopeScreen(),
        "/profile": (context) => const ProfileScreen(),
        "/self-sign": (context) => const SelfSignScreen(),
        "/verify": (context) => const VerifyScreen(),
      },
      onGenerateRoute: (settings) {
        if (settings.name?.startsWith("/sign/") == true) {
          final token = settings.name!.replaceFirst("/sign/", "");
          return MaterialPageRoute(
            builder: (context) => SignScreen(token: token),
          );
        }
        return null;
      },
    );
  }
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    final token = await AuthService.getToken();
    if (!mounted) return;
    if (token != null) {
      Navigator.pushReplacementNamed(context, "/dashboard");
    } else {
      Navigator.pushReplacementNamed(context, "/login");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.draw_outlined, size: 64, color: Color(0xFF2563EB)),
              const SizedBox(height: 16),
              const Text(AppConfig.appName, style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
              const SizedBox(height: 24),
              const CircularProgressIndicator(),
            ],
          ),
        ),
      ),
    );
  }
}
