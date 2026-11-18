resource "random_id" "this" {
  byte_length = 4

  keepers = {
    seed_input = try(var.aws_app_code, terraform.workspace)
  }
}

resource "random_pet" "this" {
  length    = 3
  separator = "-"

  keepers = {
    seed_input = try(var.aws_app_code, terraform.workspace)
  }
}

# Secret used by every Lambda to sign and verify login tokens (JWT, HS256).
# Stable across applies; passed to the functions as JWT_SECRET (see locals.tf env_vars).
resource "random_password" "jwt" {
  length  = 48
  special = false
}
