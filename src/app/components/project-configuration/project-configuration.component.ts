import { Component, OnInit } from '@angular/core';
import { DialogService } from '../../services/dialog.service';
import { Project } from '../../interfaces/project.interface';

@Component({
  selector: 'app-project-configuration',
  templateUrl: './project-configuration.component.html',
  styleUrls: ['./project-configuration.component.css']
})
export class ProjectConfigurationComponent implements OnInit {
  activeTab: 'model' | 'transcriber' | 'voice' | 'functions' | 'advanced' | 'analysis' = 'model';
  project: Project | null = null;

  constructor(private dialogService: DialogService) {}

  ngOnInit() {
    this.dialogService.dialogContext$.subscribe(project => {
      this.project = project;
    });
  }

  setActiveTab(tab: 'model' | 'transcriber' | 'voice' | 'functions' | 'advanced' | 'analysis') {
    this.activeTab = tab;
  }
}