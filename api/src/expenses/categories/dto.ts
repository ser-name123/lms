import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Marketing' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;
}
