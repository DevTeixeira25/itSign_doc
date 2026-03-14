import "package:flutter/material.dart";

class MobileShell extends StatelessWidget {
  final String title;
  final Widget child;
  final String currentRoute;
  final List<Widget>? actions;

  const MobileShell({
    super.key,
    required this.title,
    required this.child,
    required this.currentRoute,
    this.actions,
  });

  void _go(BuildContext context, String route) {
    if (route == currentRoute) return;
    Navigator.pushReplacementNamed(context, route);
  }

  int _currentIndex() {
    switch (currentRoute) {
      case "/dashboard":
        return 0;
      case "/self-sign":
        return 1;
      case "/envelopes/new":
        return 2;
      case "/verify":
        return 3;
      case "/profile":
        return 4;
      default:
        return 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      backgroundColor: scheme.surfaceContainerLowest,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: scheme.onSurface,
        title: Text(title),
        actions: actions,
      ),
      body: child,
      bottomNavigationBar: NavigationBar(
        height: 74,
        backgroundColor: Theme.of(context).navigationBarTheme.backgroundColor,
        selectedIndex: _currentIndex(),
        onDestinationSelected: (index) {
          switch (index) {
            case 0:
              _go(context, "/dashboard");
              break;
            case 1:
              _go(context, "/self-sign");
              break;
            case 2:
              _go(context, "/envelopes/new");
              break;
            case 3:
              _go(context, "/verify");
              break;
            case 4:
              _go(context, "/profile");
              break;
          }
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: "Início",
          ),
          NavigationDestination(
            icon: Icon(Icons.edit_document),
            selectedIcon: Icon(Icons.edit_document),
            label: "Assinar",
          ),
          NavigationDestination(
            icon: Icon(Icons.send_outlined),
            selectedIcon: Icon(Icons.send),
            label: "Envelope",
          ),
          NavigationDestination(
            icon: Icon(Icons.verified_outlined),
            selectedIcon: Icon(Icons.verified),
            label: "Verificar",
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: "Perfil",
          ),
        ],
      ),
    );
  }
}
