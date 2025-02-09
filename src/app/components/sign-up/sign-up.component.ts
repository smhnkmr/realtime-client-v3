import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { AuthError } from '@supabase/supabase-js';

@Component({
  selector: 'app-sign-up',
  templateUrl: './sign-up.component.html',
  styleUrls: ['./sign-up.component.css']
})
export class SignUpComponent {
  signUpForm: FormGroup;
  errorMessage: string = '';
  loading: boolean = false;

  constructor(
    private formBuilder: FormBuilder,
    private supabaseService: SupabaseService
  ) {
    this.signUpForm = this.formBuilder.group({
      fullName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    }, {
      validators: this.passwordMatchValidator
    });
  }

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');
    return password && confirmPassword && password.value === confirmPassword.value ? 
      null : { passwordMismatch: true };
  }

  async onSubmit() {
    if (this.signUpForm.valid) {
      this.loading = true;
      this.errorMessage = '';
      
      const { email, password, fullName } = this.signUpForm.value;
      const { error } = await this.supabaseService.signUp(email, password, fullName);

      if (error) {
        this.errorMessage = error.message;
      }
      
      this.loading = false;
    }
  }
}