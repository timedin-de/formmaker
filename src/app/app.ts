import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule],
  selector: 'app-root',
  template: `
    <div class="shell">
      <mat-toolbar color="primary" class="shell-toolbar">
        <span class="brand">FormMaker</span>
        <nav>
          <a
            mat-button
            routerLink="/"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: true }"
            >Forms</a
          >
          <a mat-button routerLink="/builder" routerLinkActive="active">Builder</a>
        </nav>
      </mat-toolbar>
      <main class="shell-content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [
    `
      .shell {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }
      .shell-toolbar {
        position: sticky;
        top: 0;
        z-index: 20;
      }
      .brand {
        font-weight: 600;
        margin-right: 24px;
        letter-spacing: 0.4px;
      }
      nav a.active {
        background: rgba(255, 255, 255, 0.18);
      }
      .shell-content {
        flex: 1;
        display: flex;
        flex-direction: column;
      }
      :host {
        display: block;
      }
    `,
  ],
})
export class App {}
