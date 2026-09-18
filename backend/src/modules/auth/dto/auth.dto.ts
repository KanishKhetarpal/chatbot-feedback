import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin', description: 'Username (or email) of a staff account.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  username: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MinLength(16)
  refreshToken: string;
}
