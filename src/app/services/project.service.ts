import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { Project } from '../interfaces/project.interface';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private projectsSubject = new BehaviorSubject<Project[]>([]);
  projects$ = this.projectsSubject.asObservable();

  constructor(private supabaseService: SupabaseService) {
    // Subscribe to user changes to load projects
    this.supabaseService.user$.subscribe(user => {
      if (user) {
        this.loadUserProjects(user.id);
      } else {
        this.projectsSubject.next([]);
      }
    });
  }

  private async loadUserProjects(userId: string) {
    try {
      // For now, return dummy data
      // In a real application, this would be a Supabase query
      const dummyProjects: Project[] = [
        { id: '1', name: 'Chat Assistant', userId },
        { id: '2', name: 'Image Generator', userId },
        { id: '3', name: 'Code Helper', userId },
        { id: '4', name: 'Text Analyzer', userId }
      ];
      
      this.projectsSubject.next(dummyProjects);
    } catch (error) {
      console.error('Error loading projects:', error);
      this.projectsSubject.next([]);
    }
  }

  getProjectById(projectId: string): Observable<Project | undefined> {
    return of(this.projectsSubject.value.find(p => p.id === projectId));
  }
}