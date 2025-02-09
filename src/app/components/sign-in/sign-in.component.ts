import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { AuthError } from '@supabase/supabase-js';

@Component({
  selector: 'app-sign-in',
  templateUrl: './sign-in.component.html',
  styleUrls: ['./sign-in.component.css']
})
export class SignInComponent {
  signInForm: FormGroup;
  errorMessage: string = '';
  loading: boolean = false;

  constructor(
    private formBuilder: FormBuilder,
    private supabaseService: SupabaseService
  ) {
    this.signInForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  async onSubmit() {
    if (this.signInForm.valid) {
      this.loading = true;
      this.errorMessage = '';
      
      const { email, password } = this.signInForm.value;
      const { error } = await this.supabaseService.signIn(email, password);

      if (error) {
        this.errorMessage = error.message;
      }
      
      this.loading = false;
    }
  }
}