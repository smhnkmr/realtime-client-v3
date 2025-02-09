import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Project } from '../interfaces/project.interface';

@Injectable({
  providedIn: 'root'
})
export class DialogService {
  private dialogVisibleSubject = new BehaviorSubject<boolean>(false);
  dialogVisible$ = this.dialogVisibleSubject.asObservable();

  private dialogContextSubject = new BehaviorSubject<Project | null>(null);
  dialogContext$ = this.dialogContextSubject.asObservable();

  showDialog(project?: Project) {
    if (project) {
      this.dialogContextSubject.next(project);
    } else {
      this.dialogContextSubject.next(null);
    }
    this.dialogVisibleSubject.next(true);
  }

  hideDialog() {
    this.dialogVisibleSubject.next(false);
    this.dialogContextSubject.next(null);
  }
}