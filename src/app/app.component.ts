import { Component } from '@angular/core';
import { SupabaseService } from './services/supabase.service';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  currentYear = new Date().getFullYear();
  isInDashboard = false;

  constructor(
    public supabaseService: SupabaseService,
    private router: Router
  ) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.isInDashboard = event.url === '/dashboard';
    });
  }

  async onSignOut() {
    await this.supabaseService.signOut();
  }
}