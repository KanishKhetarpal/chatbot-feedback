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

export class GuestDto {
  @ApiProperty({ example: 'Priya', description: "The tester's name, shown on their conversations and feedback." })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MinLength(16)
  refreshToken: string;
}
