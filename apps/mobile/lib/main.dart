import "package:flutter/material.dart";
import "screens/login_screen.dart";
import "screens/dashboard_screen.dart";
import "screens/sign_screen.dart";
import "services/api_service.dart";
import "services/auth_service.dart";

void main() {
  runApp(const ITSignApp());
}

class ITSignApp extends StatelessWidget {
  const ITSignApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: "ITSign",
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF2563EB),
        useMaterial3: true,
        brightness: Brightness.light,
      ),
      initialRoute: "/",
      routes: {
        "/": (context) => const SplashScreen(),
        "/login": (context) => const LoginScreen(),
        "/dashboard": (context) => const DashboardScreen(),
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
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.draw_outlined, size: 64, color: Color(0xFF2563EB)),
            SizedBox(height: 16),
            Text("ITSign", style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
            SizedBox(height: 24),
            CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
