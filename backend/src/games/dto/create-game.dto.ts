import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateGameDto {
  @IsString()
  @IsNotEmpty()
  scenarioSlug!: string;

  @IsInt()
  @Min(2)
  @Max(8)
  @IsOptional()
  maxPlayers?: number = 6;

  @IsInt()
  @Min(15)
  @Max(120)
  @IsOptional()
  turnTimeout?: number = 60;

  @IsBoolean()
  @IsOptional()
  isPrivate?: boolean = false;

  @IsString()
  @IsOptional()
  difficulty?: string = 'normal';
}
